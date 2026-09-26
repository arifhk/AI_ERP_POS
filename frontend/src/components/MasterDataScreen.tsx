'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AppShell } from './AppShell';
import { MASTER_LINKS } from './MasterEntityManager';
import { MasterDataTable, type MasterColumn, type MasterStatus } from './MasterDataTable';
import { API_BASE, apiFetch } from '../utils/api';

export type CatalogRecord = {
  id: number;
  name: string;
  category_id?: number;
  code_number?: string;
  sub_category_id?: number;
  contact_number?: string;
  email?: string;
  address?: string;
  status?: string;
  is_active?: boolean;
  is_hidden?: boolean;
  category_name?: string;
  sub_category_name?: string;
};

export type CatalogSnapshot = {
  categories?: CatalogRecord[];
  sub_categories?: CatalogRecord[];
  brands?: CatalogRecord[];
  vendors?: CatalogRecord[];
  codes?: CatalogRecord[];
};

export type MasterDraft = Record<string, string>;

type Approval = {
  entity_type: string;
  action: string;
  entity_id?: number | null;
  status: string;
};

type ScreenRow = {
  id: number;
  pendingEdit: boolean;
  pendingDelete: boolean;
  status: MasterStatus;
  source: CatalogRecord;
};

export function MasterDataScreen({
  entityType,
  title,
  description,
  recordsOf,
  columns,
  emptyDraft,
  draftFrom,
  renderFields,
  payloadFrom,
}: {
  entityType: 'sub_category' | 'vendor' | 'code';
  title: string;
  description: string;
  recordsOf: (catalog: CatalogSnapshot) => CatalogRecord[];
  columns: MasterColumn<ScreenRow>[];
  emptyDraft: MasterDraft;
  draftFrom: (record: CatalogRecord) => MasterDraft;
  renderFields: (draft: MasterDraft, setDraft: (next: MasterDraft) => void, catalog: CatalogSnapshot) => ReactNode;
  payloadFrom: (draft: MasterDraft) => Record<string, string | number> | string;
}) {
  const [catalog, setCatalog] = useState<CatalogSnapshot>({});
  const [rows, setRows] = useState<ScreenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<{ mode: 'create' | 'update'; id?: number; draft: MasterDraft } | null>(null);
  const [shown, setShown] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [catalogRes, approvalRes] = await Promise.all([
      apiFetch(`${API_BASE}/masters/catalog`),
      apiFetch(`${API_BASE}/approvals/`),
    ]);
    if (!catalogRes.ok) {
      throw new Error('Failed to load records');
    }
    const nextCatalog = (await catalogRes.json()) as CatalogSnapshot;
    const approvalPayload: unknown = approvalRes.ok ? await approvalRes.json() : [];
    const approvals = Array.isArray(approvalPayload) ? (approvalPayload as Approval[]) : [];
    const pendingFor = (action: string) =>
      new Set(
        approvals
          .filter((row) => row.status === 'Pending' && row.entity_type === entityType && row.action === action && row.entity_id)
          .map((row) => row.entity_id as number),
      );
    const pendingEdits = pendingFor('update');
    const pendingDeletes = pendingFor('delete');
    setCatalog(nextCatalog);
    setRows(
      recordsOf(nextCatalog).map((record) => ({
        id: record.id,
        source: record,
        pendingEdit: pendingEdits.has(record.id),
        pendingDelete: pendingDeletes.has(record.id),
        status:
          pendingEdits.has(record.id) || pendingDeletes.has(record.id)
            ? 'pending'
            : record.status === 'Inactive' || record.is_active === false
              ? 'inactive'
              : 'active',
      })),
    );
  }

  useEffect(() => {
    let cancelled = false;
    load()
      .catch(() => {
        if (!cancelled) {
          toast.error('Unable to load master data.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [entityType]);

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
    if (!editor) {
      return;
    }
    const payload = payloadFrom(editor.draft);
    if (typeof payload === 'string') {
      toast.error(payload);
      return;
    }
    setSaving(true);
    const response = await apiFetch(
      editor.mode === 'update' ? `${API_BASE}/masters/${entityType}/${editor.id}` : `${API_BASE}/masters/${entityType}`,
      {
        method: editor.mode === 'update' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    setSaving(false);
    if (!response.ok) {
      let message = 'Could not save this record.';
      try {
        const body = (await response.json()) as { detail?: string };
        if (typeof body.detail === 'string' && body.detail) {
          message = body.detail;
        }
      } catch {
        message = 'Could not save this record.';
      }
      toast.error(message);
      return;
    }
    const result = (await response.json()) as { pending?: boolean };
    closeEditor();
    toast.success(result.pending ? 'Submitted for Admin Approval' : editor.mode === 'create' ? `${title} created` : `${title} updated`);
    try {
      await load();
    } catch {
      toast.error('Saved, but the list could not be refreshed.');
    }
  }

  async function toggle(row: ScreenRow, field: 'is_active' | 'is_hidden', value: boolean) {
    const response = await apiFetch(`${API_BASE}/masters/${entityType}/${row.id}/flags`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    if (!response.ok) {
      toast.error('Could not update this record.');
      return;
    }
    const result = (await response.json()) as { pending?: boolean };
    toast.success(result.pending ? 'Submitted for Admin Approval' : 'Updated');
    try {
      await load();
    } catch {
      toast.error('Updated, but the list could not be refreshed.');
    }
  }

  async function remove(row: ScreenRow) {
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
    const result = (await response.json()) as { pending?: boolean };
    toast.success(result.pending ? 'Submitted for Admin Approval' : `${title} deleted`);
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
      <div className="mb-4 inline-flex max-w-full overflow-x-auto rounded-full bg-white p-1 shadow-sm ring-1 ring-gray-100">
        {MASTER_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
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
          columns={columns}
          searchPlaceholder={`Search ${title.toLowerCase()}...`}
          searchValue={(row) => Object.values(row.source).join(' ')}
          statusOf={(row) => row.status}
          labelOf={(row) => row.source.name || row.source.code_number || 'this record'}
          onAdd={() => setEditor({ mode: 'create', draft: emptyDraft })}
          addLabel={`Add ${title.replace(/s$/, '')}`}
          isActive={(row) => row.source.is_active !== false && row.source.status !== 'Inactive'}
          isHidden={(row) => row.source.is_hidden === true}
          onToggleActive={(row) => void toggle(row, 'is_active', !(row.source.is_active !== false && row.source.status !== 'Inactive'))}
          onToggleHidden={(row) => void toggle(row, 'is_hidden', row.source.is_hidden !== true)}
          onEdit={(row) => setEditor({ mode: 'update', id: row.id, draft: draftFrom(row.source) })}
          onDelete={(row) => void remove(row)}
        />
      )}
      {editor ? (
        <div className="fixed inset-0 z-50">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-900/40" onClick={closeEditor} />
          <div className={`absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-200 ease-out ${shown ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">{editor.mode === 'create' ? `Add ${title}` : `Edit ${title}`}</h2>
              <button type="button" onClick={closeEditor} className="rounded-full px-3 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-50">
                Close
              </button>
            </div>
            <form
              className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              {renderFields(editor.draft, (draft) => setEditor({ ...editor, draft }), catalog)}
              <div className="mt-auto flex justify-end gap-2 pt-4">
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

export function PendingName({ name, pending, pendingDelete = false }: { name: string; pending: boolean; pendingDelete?: boolean }) {
  const label = pendingDelete ? 'Pending Delete' : pending ? 'Pending Edit' : '';
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-medium text-slate-900">{name}</span>
      {label ? (
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-100 ring-inset">
          {label}
        </span>
      ) : null}
    </span>
  );
}

export function fieldClassName() {
  return 'mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
}

export function TextField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className={fieldClassName()} />
    </label>
  );
}
