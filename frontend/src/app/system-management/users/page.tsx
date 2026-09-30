'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../components/AppShell';
import { API_BASE, apiFetch } from '../../../utils/api';
import { useApi } from '../../../utils/query';
import { getStoredRole, isSystemOwner } from '../../../utils/auth';

type ManagedUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  tenant_id: number | null;
  tenant_name: string;
  is_active: boolean;
};

const ROLES = [
  { value: 'system_owner', label: 'System Owner' },
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'tenant_admin', label: 'Tenant Admin' },
  { value: 'tenant_user', label: 'Tenant User' },
];

export default function SystemUsersPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const { data, error: loadError, mutate } = useApi<ManagedUser[]>(allowed ? `${API_BASE}/system/users` : null);
  const users = data ?? [];
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [passwordFor, setPasswordFor] = useState<ManagedUser | null>(null);
  const [nextPassword, setNextPassword] = useState('');
  const [targetId, setTargetId] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [demoteSelf, setDemoteSelf] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSystemOwner(getStoredRole())) {
      router.replace('/');
      return;
    }
    setAllowed(true);
  }, [router]);

  useEffect(() => {
    if (!loadError) {
      return;
    }
    if (loadError.message.includes('403')) {
      router.replace('/');
      return;
    }
    setError('Could not load users.');
  }, [loadError, router]);

  async function saveRole(user: ManagedUser, role: string) {
    setNotice(null);
    setError(null);
    const response = await apiFetch(`${API_BASE}/system/users/${user.id}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, tenant_id: user.tenant_id }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { detail?: string };
      setError(typeof body.detail === 'string' ? body.detail : 'Could not change that role.');
      return;
    }
    setNotice(`${user.email} is now ${role.replace(/_/g, ' ')}.`);
    await mutate();
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    if (!passwordFor) {
      return;
    }
    setBusy(true);
    setError(null);
    const response = await apiFetch(`${API_BASE}/system/users/${passwordFor.id}/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: nextPassword }),
    });
    setBusy(false);
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { detail?: string };
      setError(typeof body.detail === 'string' ? body.detail : 'Could not update that password.');
      return;
    }
    setPasswordFor(null);
    setNextPassword('');
    setNotice(`Password updated for ${passwordFor.email}.`);
  }

  async function transfer(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await apiFetch(`${API_BASE}/system/ownership/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_user_id: Number(targetId),
        current_password: ownerPassword,
        demote_self: demoteSelf,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { detail?: string; actor_role?: string; message?: string };
    setBusy(false);
    if (!response.ok) {
      setError(typeof body.detail === 'string' ? body.detail : 'Ownership was not transferred.');
      return;
    }
    if (body.actor_role && body.actor_role !== 'system_owner') {
      localStorage.setItem('userRole', body.actor_role);
      router.replace('/');
      return;
    }
    setOwnerPassword('');
    setNotice(body.message || 'Ownership transferred.');
    await mutate();
  }

  if (!allowed) {
    return null;
  }

  return (
    <AppShell active="system">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">System users</h1>
        <p className="mt-1 text-sm text-slate-500">Every account on the platform. Only a System Owner can open this page.</p>
      </div>
      {notice ? <p className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p> : null}
      {error ? <p className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3 text-right">Password</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{user.name}</p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{user.tenant_name}</td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      onChange={(event) => void saveRole(user, event.target.value)}
                      className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                    >
                      {ROLES.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setPasswordFor(user);
                        setNextPassword('');
                      }}
                      className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Set password
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <form onSubmit={transfer} className="mt-6 max-w-xl rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Transfer ownership</h2>
        <p className="mt-1 text-sm text-slate-500">Confirm with your current password. The selected user becomes a System Owner.</p>
        <label className="mt-4 block text-sm font-medium text-slate-700">
          New owner
          <select
            required
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="">Select a user</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} · {user.email}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          Your current password
          <input
            type="password"
            required
            value={ownerPassword}
            onChange={(event) => setOwnerPassword(event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={demoteSelf} onChange={(event) => setDemoteSelf(event.target.checked)} />
          Demote me to Super Admin after the transfer
        </label>
        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400"
        >
          {busy ? 'Transferring...' : 'Transfer ownership'}
        </button>
      </form>

      {passwordFor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-slate-900/40" onClick={() => setPasswordFor(null)} aria-label="Close" />
          <form onSubmit={savePassword} className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Set password</h2>
            <p className="mt-1 text-sm text-slate-500">{passwordFor.email}</p>
            <input
              type="password"
              required
              minLength={6}
              value={nextPassword}
              onChange={(event) => setNextPassword(event.target.value)}
              className="mt-4 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              placeholder="New password"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setPasswordFor(null)} className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold">
                Cancel
              </button>
              <button type="submit" disabled={busy} className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-indigo-300">
                Save
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </AppShell>
  );
}
