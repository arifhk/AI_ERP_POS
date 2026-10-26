'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from './AppShell';
import { type AppSection } from './Sidebar';

const AUTH_PREFIXES = ['/login', '/register', '/forgot-password', '/reset-password'];

function sectionFromPath(pathname: string): AppSection {
  if (pathname.startsWith('/system-management')) {
    return 'system';
  }
  if (pathname.startsWith('/master-data') || pathname.startsWith('/masters')) {
    return 'masters';
  }
  if (pathname.startsWith('/products')) {
    return 'products';
  }
  if (pathname.startsWith('/purchases')) {
    return 'purchases';
  }
  if (pathname.startsWith('/pos')) {
    return 'pos';
  }
  if (pathname.startsWith('/orders')) {
    return 'orders';
  }
  if (pathname.startsWith('/expenses')) {
    return 'expenses';
  }
  if (pathname.startsWith('/customers')) {
    return 'customers';
  }
  if (pathname.startsWith('/users')) {
    return 'users';
  }
  if (pathname.startsWith('/tenants')) {
    return 'tenants';
  }
  if (pathname.startsWith('/branches')) {
    return 'branches';
  }
  if (pathname.startsWith('/settings')) {
    return 'settings';
  }
  return 'dashboard';
}

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '/';
  const isAuth = AUTH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (isAuth) {
    return children;
  }

  const isPos = pathname === '/pos' || pathname.startsWith('/pos/');
  const printHidden = isPos || pathname === '/orders' || pathname.startsWith('/orders/');

  return (
    <AppShell
      active={sectionFromPath(pathname)}
      className={printHidden ? 'print:hidden' : ''}
      mainClassName={
        isPos ? 'flex min-h-0 flex-1 flex-col overflow-hidden bg-gray-50 md:flex-row' : undefined
      }
    >
      {children}
    </AppShell>
  );
}
