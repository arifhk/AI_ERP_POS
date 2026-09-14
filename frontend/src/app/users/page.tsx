'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Sidebar } from '../../components/Sidebar';
import { API_BASE, apiFetch } from '../../utils/api';
const ROLE_OPTIONS = ['Admin', 'Cashier', 'Manager', 'Inventory'] as const;

type User = {
  id: number;
  name: string;
  email: string;
  role: string;
  branch_id: number | null;
  is_active: boolean;
};

const emptyForm = {
  name: '',
  email: '',
  role: 'Cashier',
  branch_id: '1',
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [activeTab, setActiveTab] = useState<'staff' | 'pending'>('staff');
  const [approveUser, setApproveUser] = useState<User | null>(null);
  const [approveRole, setApproveRole] = useState<(typeof ROLE_OPTIONS)[number]>('Cashier');
  const [approveBranchId, setApproveBranchId] = useState('1');
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  async function loadUsers() {
    const response = await apiFetch(`${API_BASE}/users/?limit=200`);
    if (!response.ok) {
      throw new Error('Failed to load users');
    }

    const data: unknown = await response.json();
    setUsers(Array.isArray(data) ? (data as User[]) : []);
  }

  useEffect(() => {
    let cancelled = false;

    async function initialLoad() {
      try {
        await loadUsers();
      } catch {
        if (!cancelled) {
          setError('Unable to load users from the server.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    initialLoad();
    return () => {
      cancelled = true;
    };
  }, []);

  function openModal() {
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (submitting) {
      return;
    }
    setModalOpen(false);
    setFormError(null);
    setForm(emptyForm);
  }

  function openApproveModal(user: User) {
    setApproveUser(user);
    setApproveRole('Cashier');
    setApproveBranchId(user.branch_id ? String(user.branch_id) : '1');
    setApproveError(null);
  }

  function closeApproveModal() {
    if (approving) {
      return;
    }
    setApproveUser(null);
    setApproveError(null);
  }

  async function handleApprove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!approveUser) {
      return;
    }

    setApproving(true);
    setApproveError(null);

    try {
      const response = await apiFetch(`${API_BASE}/users/${approveUser.id}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: approveRole,
          branch_id: Number(approveBranchId),
          is_active: true,
        }),
      });

      if (!response.ok) {
        let message = 'Could not approve the user.';
        try {
          const payload = (await response.json()) as { detail?: unknown };
          if (typeof payload.detail === 'string') {
            message = payload.detail;
          }
        } catch {
          // Keep the generic message if the error body is not JSON.
        }
        throw new Error(message);
      }

      setApproveUser(null);
      await loadUsers();
    } catch (caught) {
      setApproveError(caught instanceof Error ? caught.message : 'Could not approve the user.');
    } finally {
      setApproving(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      const response = await apiFetch(`${API_BASE}/users/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: 1,
          is_active: true,
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
          branch_id: Number(form.branch_id),
        }),
      });

      if (!response.ok) {
        let message = 'Could not create the user.';
        try {
          const payload = (await response.json()) as { detail?: unknown };
          if (typeof payload.detail === 'string') {
            message = payload.detail;
          }
        } catch {
          // Keep the generic message if the error body is not JSON.
        }
        throw new Error(message);
      }

      setModalOpen(false);
      setForm(emptyForm);
      await loadUsers();
      window.alert('User added successfully!');
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Could not create the user.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar active="users" />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between p-4 bg-white border-b border-gray-200">
          <div className="flex items-center">
            <input
              type="text"
              placeholder="Search..."
              className="w-64 px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-center space-x-4">
            <button className="text-gray-500 hover:text-gray-700 text-xl">🔔</button>
            <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold cursor-pointer">
              AH
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-gray-800">Users</h1>
              <p className="mt-1 text-sm text-gray-500">Manage staff accounts, roles, and branch assignments.</p>
            </div>
            <button
              type="button"
              onClick={openModal}
              className="rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Add New User
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center rounded-lg border border-gray-100 bg-white p-16 shadow-sm">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                <p className="text-sm font-medium text-gray-500">Loading data...</p>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-6 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="mb-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('staff')}
                  className={`rounded-md px-4 py-2 text-sm font-semibold ${
                    activeTab === 'staff'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'
                  }`}
                >
                  Staff
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('pending')}
                  className={`rounded-md px-4 py-2 text-sm font-semibold ${
                    activeTab === 'pending'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'
                  }`}
                >
                  Pending Approvals
                  {users.filter((user) => !user.is_active).length > 0 ? (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                      {users.filter((user) => !user.is_active).length}
                    </span>
                  ) : null}
                </button>
              </div>

              <div className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  {activeTab === 'staff' ? (
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Name</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Email</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Role</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Branch ID</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {users.filter((user) => user.is_active).length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">
                              No users found. Add a user to get started.
                            </td>
                          </tr>
                        ) : (
                          users.filter((user) => user.is_active).map((user) => (
                            <tr key={user.id} className="hover:bg-gray-50">
                              <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                                {user.name}
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                                {user.email}
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                                {user.role}
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                                {user.branch_id ?? '—'}
                              </td>
                              <td className="whitespace-nowrap px-6 py-4">
                                <span className="inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                                  Active
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  ) : (
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Name</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Email</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Role</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                          <th scope="col" className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {users.filter((user) => !user.is_active).length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">
                              No pending approvals.
                            </td>
                          </tr>
                        ) : (
                          users.filter((user) => !user.is_active).map((user) => (
                            <tr key={user.id} className="hover:bg-gray-50">
                              <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                                {user.name}
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                                {user.email}
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                                {user.role}
                              </td>
                              <td className="whitespace-nowrap px-6 py-4">
                                <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                                  Pending
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => openApproveModal(user)}
                                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                                >
                                  Approve
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-user-title"
        >
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 id="add-user-title" className="text-lg font-semibold text-gray-900">
                Add New User
              </h2>
              <p className="mt-1 text-sm text-gray-500">Create a staff account and assign a branch role.</p>
            </div>

            <form onSubmit={(event) => void handleSubmit(event)} className="px-6 py-5">
              <div className="space-y-4">
                <div>
                  <label htmlFor="user-name" className="mb-1 block text-sm font-medium text-gray-700">
                    Name
                  </label>
                  <input
                    id="user-name"
                    required
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. Ayesha Rahman"
                  />
                </div>
                <div>
                  <label htmlFor="user-email" className="mb-1 block text-sm font-medium text-gray-700">
                    Email
                  </label>
                  <input
                    id="user-email"
                    required
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. ayesha@example.com"
                  />
                </div>
                <div>
                  <label htmlFor="user-role" className="mb-1 block text-sm font-medium text-gray-700">
                    Role
                  </label>
                  <select
                    id="user-role"
                    value={form.role}
                    onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="user-branch" className="mb-1 block text-sm font-medium text-gray-700">
                    Branch ID
                  </label>
                  <input
                    id="user-branch"
                    required
                    type="number"
                    min="1"
                    step="1"
                    value={form.branch_id}
                    onChange={(event) => setForm((current) => ({ ...current, branch_id: event.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="1"
                  />
                </div>
              </div>

              {formError && (
                <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
                >
                  {submitting ? 'Saving...' : 'Save User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {approveUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="approve-user-title"
        >
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 id="approve-user-title" className="text-lg font-semibold text-gray-900">
                Approve user
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Assign a role and branch for {approveUser.name} ({approveUser.email}).
              </p>
            </div>

            <form onSubmit={(event) => void handleApprove(event)} className="px-6 py-5">
              <div className="space-y-4">
                <div>
                  <label htmlFor="approve-role" className="mb-1 block text-sm font-medium text-gray-700">
                    Role
                  </label>
                  <select
                    id="approve-role"
                    value={approveRole}
                    onChange={(event) =>
                      setApproveRole(event.target.value as (typeof ROLE_OPTIONS)[number])
                    }
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="approve-branch" className="mb-1 block text-sm font-medium text-gray-700">
                    Branch ID
                  </label>
                  <input
                    id="approve-branch"
                    required
                    type="number"
                    min="1"
                    step="1"
                    value={approveBranchId}
                    onChange={(event) => setApproveBranchId(event.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {approveError && (
                <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{approveError}</p>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeApproveModal}
                  disabled={approving}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={approving}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
                >
                  {approving ? 'Approving...' : 'Approve'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
