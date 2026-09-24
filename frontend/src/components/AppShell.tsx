'use client';

import { useState, type ReactNode } from 'react';
import { Sidebar, type AppSection } from './Sidebar';

type AppShellProps = {
  active: AppSection;
  children: ReactNode;
  header?: ReactNode;
  mainClassName?: string;
  className?: string;
};

export function AppShell({
  active,
  children,
  header,
  mainClassName = 'flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-4 sm:p-6',
  className = '',
}: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className={`flex h-dvh bg-gray-100 ${className}`}>
      {navOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setNavOpen(false)}
        />
      ) : null}
      <div className={`${navOpen ? 'fixed inset-y-0 left-0 z-40 flex' : 'hidden'} md:static md:z-auto md:flex`}>
        <Sidebar active={active} onNavigate={() => setNavOpen(false)} className="h-full" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white p-3 sm:p-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setNavOpen(true)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-700 md:hidden"
            >
              <span aria-hidden="true" className="text-lg leading-none">
                ☰
              </span>
            </button>
            {header ? <div className="min-w-0 flex-1">{header}</div> : null}
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            <button type="button" className="text-xl text-gray-500 hover:text-gray-700" aria-label="Notifications">
              🔔
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
              AH
            </div>
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
        <h1 className="text-2xl font-semibold text-gray-800 sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-gray-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
