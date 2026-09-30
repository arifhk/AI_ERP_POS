'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AppShell } from './AppShell';
import { MasterDataTable, type MasterStatus } from './MasterDataTable';
import { API_BASE, apiFetch } from '../utils/api';
import { prefetchRoute, useApi } from '../utils/query';

type EntityType = 'category' | 'brand';

type MasterRow = {
  id: number;
  name: string;
  isActive: boolean;
  isHidden: boolean;
  pendingEdit: boolean;
  pendingDelete: boolean;
  status: MasterStatus;
};

type Approval = {
  entity_type: string;
  action: string;
  entity_id?: number | null;
  status: string;
};

export const MASTER_LINKS = [
  { href: '/master-data/categories', label: 'Categories', entity: 'category' },
  { href: '/master-data/sub-categories', label: 'Sub-Categories', entity: 'sub_category' },
  { href: '/master-data/brands', label: 'Brands', entity: 'brand' },
  { href: '/master-data/vendors', label: 'Vendors', entity: 'vendor' },
  { href: '/master-data/code-master', label: 'Code Master', entity: 'code' },
] as const;

export function MasterEntityManager({
  entityType,
  title,
  description,
}: {
  entityType: EntityType;
  title: string;
  description: string;
}) {
  const catalogQuery = useApi<{ categories?: { id: number; name: string; is_active?: boolean; is_hidden?: boolean }[]; brands?: { id: number; name: string; is_active?: boolean; is_hidden?: boolean }[] }>(`${API_BASE}/masters/catalog`);
  const approvalQuery = useApi<Approval[]>(`${API_BASE}/approvals/`);
  const loading = catalogQuery.isLoading && !catalogQuery.data;
  const rows = useMemo(() => {
    const catalog = catalogQuery.data ?? {};
    const approvals = Array.isArray(approvalQuery.data) ? approvalQuery.data : [];
    const pendingFor = (action: string) =>
      new Set(
        approvals
          .filter((row) => row.status === 'Pending' && row.entity_type === entityType && row.action === action && row.entity_id)
          .map((row) => row.entity_id as number),
      );
    const pendingEdits = pendingFor('update');
    const pendingDeletes = pendingFor('delete');
    const source = entityType === 'category' ? catalog.categories : catalog.brands;
    return (source ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      isActive: row.is_active !== false,
      isHidden: row.is_hidden === true,
      pendingEdit: pendingEdits.has(row.id),
      pendingDelete: pendingDeletes.has(row.id),
      status: pendingEdits.has(row.id) || pendingDeletes.has(row.id) ? 'pending' : row.is_active === false ? 'inactive' : 'active',
    })) satisfies MasterRow[];
  }, [approvalQuery.data, catalogQuery.data, entityType]);
  const [editor, setEditor] = useState<{ mode: 'create' | 'update'; id?: number; name: string } | null>(null);
  const [shown, setShown] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    await Promise.all([catalogQuery.mutate(), approvalQuery.mutate()]);
  }

  useEffect(() => {
    if (catalogQuery.error) {
      toast.error('Unable to load master data.');
    }
  }, [catalogQuery.error]);

  useEffect(() => {
    if (!editor) {
      setShown(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => setShown(true));
    return () => window.cancelAnimationFrame(frame);
  }, [editor]);

  function closeEditor() {
    setShown(false);
    window.setTimeout(() => setEditor(null), 180);
  }

  async function save() {
    if (!editor || !editor.name.trim()) {
      toast.error('Name is required.');
      return;
    }
    setSaving(true);
    const response = await apiFetch(
      editor.mode === 'update' ? `${API_BASE}/masters/${entityType}/${editor.id}` : `${API_BASE}/masters/${entityType}`,
      {
        method: editor.mode === 'update' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editor.name.trim() }),
      },
    );
    setSaving(false);
    if (!response.ok) {
      toast.error('Could not save this record.');
      return;
    }
    const payload = (await response.json()) as { pending?: boolean };
    closeEditor();
    if (payload.pending) {
      toast.success('Submitted for Admin Approval');
    } else {
      toast.success(editor.mode === 'create' ? `${title} created` : `${title} updated`);
    }
    try {
      await load();
    } catch {
      toast.error('Saved, but the list could not be refreshed.');
    }
  }

  async function toggle(row: MasterRow, field: 'is_active' | 'is_hidden', value: boolean) {
    const response = await apiFetch(`${API_BASE}/masters/${entityType}/${row.id}/flags`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    if (!response.ok) {
      toast.error('Could not update this record.');
      return;
    }
    const payload = (await response.json()) as { pending?: boolean };
    toast.success(payload.pending ? 'Submitted for Admin Approval' : 'Updated');
    try {
      await load();
    } catch {
      toast.error('Updated, but the list could not be refreshed.');
    }
  }

  async function remove(row: MasterRow) {
    const response = await apiFetch(`${API_BASE}/masters/${entityType}/${row.id}`, { method: 'DELETE' });
    if (!response.ok) {
      let message = 'Could not delete this record.';
      try {
        const body = (await response.json()) as { detail?: string };
        if (typeof body.detail === 'string' && body.detail) {
          message = body.detail;
        }
      } catch {
        message = 'Could not delete this record.';
      }
      toast.error(message);
      return;
    }
    const payload = (await response.json()) as { pending?: boolean };
    toast.success(payload.pending ? 'Submitted for Admin Approval' : `${title} deleted`);
    try {
      await load();
    } catch {
      toast.error('Deleted, but the list could not be refreshed.');
    }
  }

  return (
    <AppShell active="masters">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
      </div>
      <div className="mb-4 inline-flex rounded-full bg-white p-1 shadow-sm ring-1 ring-gray-100">
        {MASTER_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            prefetch
            onMouseEnter={() => prefetchRoute(link.href)}
            onFocus={() => prefetchRoute(link.href)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              link.entity === entityType ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>
      {loading ? (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-100 border-t-indigo-600" />
        </div>
      ) : (
        <MasterDataTable
          title={title}
          description="Admins save immediately. Other users submit changes for approval."
          rows={rows}
          searchPlaceholder={`Search ${title.toLowerCase()}...`}
          searchValue={(row) => row.name}
          statusOf={(row) => row.status}
          labelOf={(row) => row.name}
          onAdd={() => setEditor({ mode: 'create', name: '' })}
          addLabel={`Add ${title.replace(/s$/, '')}`}
          isActive={(row) => row.isActive}
          isHidden={(row) => row.isHidden}
          onToggleActive={(row) => void toggle(row, 'is_active', !row.isActive)}
          onToggleHidden={(row) => void toggle(row, 'is_hidden', !row.isHidden)}
          onEdit={(row) => setEditor({ mode: 'update', id: row.id, name: row.name })}
          onDelete={(row) => void remove(row)}
          columns={[
            {
              key: 'name',
              header: 'Name',
              render: (row) => (
                <span className="inline-flex items-center gap-2">
                  <span className="font-medium text-slate-900">{row.name}</span>
                  {row.pendingDelete || row.pendingEdit ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-100 ring-inset">
                      {row.pendingDelete ? 'Pending Delete' : 'Pending Edit'}
                    </span>
                  ) : null}
                </span>
              ),
            },
          ]}
        />
      )}
      {editor ? (
        <div className="fixed inset-0 z-50">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-900/40" onClick={closeEditor} />
          <div
            className={`absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-200 ease-out ${
              shown ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">{editor.mode === 'create' ? `Add ${title}` : `Edit ${title}`}</h2>
              <button type="button" onClick={closeEditor} className="rounded-full px-3 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-50">
                Close
              </button>
            </div>
            <form
              className="flex flex-1 flex-col gap-4 px-5 py-5"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <label className="block text-sm font-medium text-slate-700">
                Name
                <input
                  value={editor.name}
                  onChange={(event) => setEditor({ ...editor, name: event.target.value })}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  autoFocus
                />
              </label>
              <div className="mt-auto flex justify-end gap-2">
                <button type="button" onClick={closeEditor} className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-slate-700">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-indigo-300">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
