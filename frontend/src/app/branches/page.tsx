'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Sidebar } from '../../components/Sidebar';

const API_BASE = 'http://localhost:8000';

type Branch = {
  id: number;
  tenant_id: number;
  name: string;
  code: string;
  address?: string | null;
  is_active: boolean;
};

const emptyForm = {
  name: '',
  code: '',
  address: '',
  tenant_id: '1',
  is_active: true,
};

function parseApiError(detail: unknown, fallback: string) {
  if (typeof detail === 'string') {
    return detail;
  }
  return fallback;
}

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  async function loadBranches() {
    const response = await fetch(`${API_BASE}/branches/`);
    if (!response.ok) {
      throw new Error('Failed to load branches');
    }
    const data: unknown = await response.json();
    setBranches(Array.isArray(data) ? (data as Branch[]) : []);
  }

  useEffect(() => {
    let cancelled = false;

    async function initialLoad() {
      try {
        await loadBranches();
      } catch {
        if (!cancelled) {
          setError('Unable to load branches from the server.');
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      const response = await fetch(`${API_BASE}/branches/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          code: form.code.trim(),
          address: form.address.trim() || null,
          tenant_id: Number(form.tenant_id),
          is_active: form.is_active,
        }),
      });

      if (!response.ok) {
        let message = 'Could not create the branch.';
        try {
          const payload = (await response.json()) as { detail?: unknown };
          message = parseApiError(payload.detail, message);
        } catch {
          // Keep the generic message if the error body is not JSON.
        }
        throw new Error(message);
      }

      setModalOpen(false);
      setForm(emptyForm);
      await loadBranches();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Could not create the branch.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar active="branches" />

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
              <h1 className="text-3xl font-semibold text-gray-800">Branches</h1>
              <p className="mt-1 text-sm text-gray-500">Manage store locations belonging to each tenant.</p>
            </div>
            <button
              type="button"
              onClick={openModal}
              className="rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Add Branch
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

              <div className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">ID</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Name</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Code</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Address</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Tenant ID</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {branches.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500">
                            No branches found. Add a branch to get started.
                          </td>
                        </tr>
                      ) : (
                        branches.map((branch) => (
                          <tr key={branch.id} className="hover:bg-gray-50">
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{branch.id}</td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">{branch.name}</td>
                            <td className="whitespace-nowrap px-6 py-4 font-mono text-sm text-gray-600">{branch.code}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{branch.address || '—'}</td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{branch.tenant_id}</td>
                            <td className="whitespace-nowrap px-6 py-4">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  branch.is_active
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {branch.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
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
          aria-labelledby="add-branch-title"
        >
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 id="add-branch-title" className="text-lg font-semibold text-gray-900">
                Add Branch
              </h2>
              <p className="mt-1 text-sm text-gray-500">Create a store location under a tenant.</p>
            </div>

            <form onSubmit={(event) => void handleSubmit(event)} className="px-6 py-5">
              <div className="space-y-4">
                <div>
                  <label htmlFor="branch-name" className="mb-1 block text-sm font-medium text-gray-700">
                    Name
                  </label>
                  <input
                    id="branch-name"
                    required
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. Joydebpur Branch"
                  />
                </div>
                <div>
                  <label htmlFor="branch-code" className="mb-1 block text-sm font-medium text-gray-700">
                    Code
                  </label>
                  <input
                    id="branch-code"
                    required
                    value={form.code}
                    onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. JB-01"
                  />
                </div>
                <div>
                  <label htmlFor="branch-address" className="mb-1 block text-sm font-medium text-gray-700">
                    Address
                  </label>
                  <input
                    id="branch-address"
                    value={form.address}
                    onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. Gazipur"
                  />
                </div>
                <div>
                  <label htmlFor="branch-tenant" className="mb-1 block text-sm font-medium text-gray-700">
                    Tenant ID
                  </label>
                  <input
                    id="branch-tenant"
                    required
                    type="number"
                    min="1"
                    step="1"
                    value={form.tenant_id}
                    onChange={(event) => setForm((current) => ({ ...current, tenant_id: event.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="1"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Is Active
                </label>
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
                  {submitting ? 'Saving...' : 'Save Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
