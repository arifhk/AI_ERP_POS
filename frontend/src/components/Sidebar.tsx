'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Building2,
  Contact,
  LayoutDashboard,
  MonitorSmartphone,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  LogOut,
  Settings,
  Shapes,
  Shield,
  ShoppingBag,
  Store,
  Users,
  Wallet,
} from 'lucide-react';
import { getStoredRole, isAdminRole, isPlatformRole, isSystemOwner } from '../utils/auth';
import { ThemeSwitcher } from './ThemeSwitcher';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard', key: 'dashboard', icon: LayoutDashboard },
  { href: '/system-management/users', label: 'System', key: 'system', icon: Shield },
  { href: '/tenants', label: 'Tenants', key: 'tenants', icon: Building2 },
  { href: '/branches', label: 'Branches', key: 'branches', icon: Store },
  { href: '/users', label: 'Users', key: 'users', icon: Users },
  { href: '/products', label: 'Products', key: 'products', icon: Package },
  { href: '/master-data/categories', label: 'Masters', key: 'masters', icon: Shapes },
  { href: '/purchases', label: 'Purchases', key: 'purchases', icon: ShoppingBag },
  { href: '/pos', label: 'POS', key: 'pos', icon: MonitorSmartphone },
  { href: '/orders', label: 'Orders', key: 'orders', icon: Receipt },
  { href: '/expenses', label: 'Expenses', key: 'expenses', icon: Wallet },
  { href: '/customers', label: 'Customers', key: 'customers', icon: Contact },
  { href: '/settings', label: 'Settings', key: 'settings', icon: Settings },
] as const;

export type AppSection = (typeof NAV_LINKS)[number]['key'];

const CASHIER_KEYS = new Set(['pos', 'orders', 'expenses', 'purchases']);

type SidebarProps = {
  active: AppSection;
  className?: string;
  collapsed?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
};

export function Sidebar({ active, className = '', collapsed = false, onToggle, onNavigate }: SidebarProps) {
  const [isAdmin] = useState(() => isAdminRole(getStoredRole()));
  const [isPlatform] = useState(() => isPlatformRole(getStoredRole()));
  const [isOwner] = useState(() => isSystemOwner(getStoredRole()));
  const router = useRouter();
  const links = (!isAdmin ? NAV_LINKS.filter((link) => CASHIER_KEYS.has(link.key)) : NAV_LINKS).filter((link) => {
    if (link.key === 'tenants') {
      return isPlatform;
    }
    if (link.key === 'system') {
      return isOwner;
    }
    return true;
  });
  const mainLinks = links.filter((link) => link.key !== 'settings');
  const showSettings = links.some((link) => link.key === 'settings');

  function signOut() {
    localStorage.clear();
    router.push('/login');
  }

  return (
    <aside
      className={`hidden h-full shrink-0 flex-col border-r border-gray-100 bg-white transition-[width] duration-200 ease-out md:flex dark:border-slate-700 dark:bg-slate-800 ${
        collapsed ? 'w-[76px]' : 'w-64'
      } ${className}`}
    >
      <div className={`flex h-16 items-center border-b border-gray-100 dark:border-slate-700 ${collapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
        <Link href="/" onClick={onNavigate} className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-xs font-bold text-white">
            AI
          </span>
          <span className={`truncate text-sm font-semibold text-slate-900 transition-opacity duration-200 dark:text-slate-100 ${collapsed ? 'w-0 opacity-0' : 'opacity-100'}`}>
            AI ERP & POS
          </span>
        </Link>
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`rounded-full p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 dark:hover:bg-slate-700 dark:hover:text-slate-100 ${collapsed ? 'hidden' : ''}`}
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {mainLinks.map((link) => {
          const Icon = link.icon;
          const isActive = active === link.key;
          return (
            <Link
              key={link.key}
              href={link.href}
              title={link.label}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
                isActive ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100'
              } ${collapsed ? 'justify-center px-0' : ''}`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className={`truncate transition-opacity duration-200 ${collapsed ? 'hidden' : ''}`}>{link.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-2 border-t border-gray-100 p-3 dark:border-slate-700">
        <ThemeSwitcher collapsed={collapsed} />
        {showSettings ? (
          <Link
            href="/settings"
            title="Settings"
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100 ${
              active === 'settings' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' : ''
            } ${collapsed ? 'justify-center px-0' : ''}`}
          >
            <Settings className="h-[18px] w-[18px] shrink-0" />
            <span className={collapsed ? 'hidden' : ''}>Settings</span>
          </Link>
        ) : null}
        <button
          type="button"
          onClick={signOut}
          title="Sign out"
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100 ${collapsed ? 'justify-center px-0' : ''}`}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          <span className={collapsed ? 'hidden' : ''}>Sign out</span>
        </button>
        {collapsed && onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Expand sidebar"
            className="flex w-full items-center justify-center rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 dark:hover:bg-slate-700 dark:hover:text-slate-100"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </aside>
  );
}
