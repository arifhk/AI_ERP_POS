'use client';

import Link from 'next/link';
import { useState } from 'react';
import { getStoredRole, isAdminRole } from '../utils/auth';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard', key: 'dashboard' },
  { href: '/tenants', label: 'Tenants', key: 'tenants' },
  { href: '/branches', label: 'Branches', key: 'branches' },
  { href: '/users', label: 'Users', key: 'users' },
  { href: '/products', label: 'Products', key: 'products' },
  { href: '/purchases', label: 'Purchases', key: 'purchases' },
  { href: '/pos', label: 'POS', key: 'pos' },
  { href: '/orders', label: 'Orders', key: 'orders' },
  { href: '/expenses', label: 'Expenses', key: 'expenses' },
  { href: '/customers', label: 'Customers', key: 'customers' },
  { href: '/settings', label: 'Settings', key: 'settings' },
] as const;

export type AppSection = (typeof NAV_LINKS)[number]['key'];

const CASHIER_KEYS = new Set(['pos', 'orders', 'expenses', 'purchases']);

type SidebarProps = {
  active: AppSection;
  className?: string;
  onNavigate?: () => void;
};

export function Sidebar({ active, className = '', onNavigate }: SidebarProps) {
  const [isAdmin] = useState(() => isAdminRole(getStoredRole()));
  const links = !isAdmin
    ? NAV_LINKS.filter((link) => CASHIER_KEYS.has(link.key))
    : NAV_LINKS;

  return (
    <aside className={`flex w-64 shrink-0 flex-col bg-gray-900 text-white ${className}`}>
      <div className="p-6 text-2xl font-bold border-b border-gray-800">
        AI ERP & POS
      </div>
      <nav className="flex-1 p-4 space-y-2">
        {links.map((link) => (
          <Link
            key={link.key}
            href={link.href}
            onClick={onNavigate}
            className={`block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700 ${
              active === link.key ? 'bg-gray-800' : ''
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
