'use client';

import { useState } from 'react';
import { AppShell, PageHeading } from '../../components/AppShell';
import { getStoredRole } from '../../utils/auth';

export default function SettingsPage() {
  const [role] = useState(() => getStoredRole() ?? 'Staff');

  return (
    <AppShell active="settings">
      <PageHeading
        title="Settings"
        description="Workspace preferences for this browser session."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Account</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-gray-500">Signed-in role</dt>
              <dd className="font-semibold text-gray-900">{role}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-gray-500">Workspace</dt>
              <dd className="font-semibold text-gray-900">Plus Point</dd>
            </div>
          </dl>
        </section>
        <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Display</h2>
          <p className="mt-4 text-sm leading-6 text-gray-600">
            Navigation collapses into the menu on phones. Catalog and history tables switch to cards below the tablet breakpoint, and wider screens keep the full data tables.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
