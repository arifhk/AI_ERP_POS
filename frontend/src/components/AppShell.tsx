'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, LogOut, Menu, Search } from 'lucide-react';
import { Sidebar, type AppSection } from './Sidebar';
import { API_BASE, apiFetch } from '../utils/api';
import { decodeJwtPayload, getStoredRole } from '../utils/auth';

type AppShellProps = {
  active: AppSection;
  children: ReactNode;
  header?: ReactNode;
  mainClassName?: string;
  className?: string;
};

type ApprovalNotice = {
  id: number;
  entity_type: string;
  action: string;
  status: string;
  payload: { name?: string; summary?: string; code_number?: string };
};

const QUICK_LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/products', label: 'Products' },
  { href: '/master-data/categories', label: 'Masters' },
  { href: '/pos', label: 'POS' },
  { href: '/orders', label: 'Orders' },
  { href: '/customers', label: 'Customers' },
  { href: '/purchases', label: 'Purchases' },
  { href: '/expenses', label: 'Expenses' },
];

export function AppShell({
  active,
  children,
  header,
  mainClassName = 'flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 p-4 sm:p-6 dark:bg-slate-900',
  className = '',
}: AppShellProps) {
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [notices, setNotices] = useState<ApprovalNotice[]>([]);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const searchRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = localStorage.getItem('token') ?? '';
    const payload = token ? decodeJwtPayload(token) : {};
    setEmail(typeof payload.sub === 'string' ? payload.sub : '');
    setRole(getStoredRole() ?? '');
    let cancelled = false;
    apiFetch(`${API_BASE}/approvals/`)
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const data: unknown = await response.json();
        if (!cancelled && Array.isArray(data)) {
          setNotices(
            (data as ApprovalNotice[]).filter((row) => row.status === 'Pending').slice(0, 8),
          );
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (searchRef.current && !searchRef.current.contains(target)) {
        setSearchOpen(false);
      }
      if (noticeRef.current && !noticeRef.current.contains(target)) {
        setNoticesOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(target)) {
        setProfileOpen(false);
      }
    }
    window.addEventListener('mousedown', onPointer);
    return () => window.removeEventListener('mousedown', onPointer);
  }, []);

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return QUICK_LINKS;
    }
    return QUICK_LINKS.filter((link) => link.label.toLowerCase().includes(term));
  }, [search]);

  function submitSearch() {
    const term = search.trim();
    const destination = matches[0]?.href ?? `/products?q=${encodeURIComponent(term)}`;
    setSearchOpen(false);
    if (term && matches.length === 0) {
      router.push(`/products?q=${encodeURIComponent(term)}`);
      return;
    }
    router.push(destination);
  }

  function signOut() {
    localStorage.clear();
    router.push('/login');
  }

  const initials = (email || 'User')
    .split('@')[0]
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={`flex h-dvh w-full bg-slate-50 dark:bg-slate-900 ${className}`}>
      <div className="hidden shrink-0 md:flex">
        <Sidebar active={active} collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} className="h-full" />
      </div>

      {navOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setNavOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex h-full shadow-xl">
            <Sidebar active={active} collapsed={false} onNavigate={() => setNavOpen(false)} className="h-full max-md:flex!" />
          </div>
        </div>
      ) : null}

      <div className="flex w-full min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-16 w-full items-center gap-3 border-b border-gray-100 bg-white/95 px-3 backdrop-blur sm:px-4 dark:border-slate-700 dark:bg-slate-800/95">
          <button
            type="button"
            aria-label="Open navigation"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 text-slate-700 transition hover:bg-slate-50 md:hidden dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div ref={searchRef} className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitSearch();
                }
              }}
              placeholder="Search pages or products..."
              className="h-10 w-full rounded-full border border-gray-200 bg-slate-50 pl-9 pr-4 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:bg-slate-900"
            />
            {searchOpen ? (
              <div className="absolute left-0 right-0 top-12 z-40 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                {matches.length === 0 ? (
                  <button type="button" onClick={submitSearch} className="block w-full px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700">
                    Search products for “{search.trim()}”
                  </button>
                ) : (
                  matches.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setSearchOpen(false)}
                      className="block px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      {link.label}
                    </Link>
                  ))
                )}
              </div>
            ) : null}
          </div>
          {header ? <div className="hidden min-w-0 max-w-xs flex-1 lg:block">{header}</div> : null}
          <div ref={noticeRef} className="relative">
            <button
              type="button"
              aria-label="Notifications"
              onClick={() => {
                setNoticesOpen((open) => !open);
                setProfileOpen(false);
              }}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Bell className="h-4 w-4" />
              {notices.length > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white">
                  {notices.length}
                </span>
              ) : null}
            </button>
            {noticesOpen ? (
              <div className="absolute right-0 top-12 z-40 w-80 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                <p className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:text-slate-100">Approvals</p>
                {notices.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-slate-500">No pending maker-checker items.</p>
                ) : (
                  <ul>
                    {notices.map((notice) => (
                      <li key={notice.id} className="border-b border-gray-50 px-4 py-3 text-sm last:border-0 dark:border-slate-700">
                        <p className="font-medium text-slate-800 dark:text-slate-100">
                          {notice.action} {notice.entity_type.replaceAll('_', ' ')}
                        </p>
                        <p className="mt-0.5 text-slate-500">
                          {notice.payload.summary || notice.payload.name || notice.payload.code_number || 'Pending review'}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                <Link href="/products" onClick={() => setNoticesOpen(false)} className="block px-4 py-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-50">
                  Open approval queue
                </Link>
              </div>
            ) : null}
          </div>
          <div ref={profileRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setProfileOpen((open) => !open);
                setNoticesOpen(false);
              }}
              className="flex h-10 items-center gap-2 rounded-full border border-gray-200 bg-white pl-1 pr-3 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                {initials}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block max-w-32 truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{email || 'Signed in'}</span>
                <span className="block text-[11px] capitalize text-slate-500">{role || 'User'}</span>
              </span>
            </button>
            {profileOpen ? (
              <div className="absolute right-0 top-12 z-40 w-56 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                <div className="px-4 py-3">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{email || 'Signed in'}</p>
                  <p className="text-xs capitalize text-slate-500">{role || 'User'}</p>
                </div>
                <button
                  type="button"
                  onClick={signOut}
                  className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </header>
        <main className={mainClassName}>{children}</main>
      </div>
    </div>
  );
}

export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-100">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
