'use client';

import { useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { MasterDataTable, type MasterStatus } from '../../components/MasterDataTable';
import { API_BASE } from '../../utils/api';
import { useApi } from '../../utils/query';

type Tab = 'categories' | 'brands' | 'vendors';

type MasterRow = {
  id: number | string;
  name: string;
  detail: string;
  status: MasterStatus;
};

type Approval = {
  id: number;
  entity_type: string;
  action: string;
  entity_id?: number | null;
  status: string;
  payload: { name?: string; summary?: string };
};

const TABS: { id: Tab; label: string; entity: string }[] = [
  { id: 'categories', label: 'Categories', entity: 'category' },
  { id: 'brands', label: 'Brands', entity: 'brand' },
  { id: 'vendors', label: 'Vendors', entity: 'vendor' },
];

export default function MastersPage() {
  const [tab, setTab] = useState<Tab>('categories');
  const catalogQuery = useApi<{
    categories?: { id: number; name: string }[];
    brands?: { id: number; name: string }[];
    vendors?: { id: number; name: string }[];
  }>(`${API_BASE}/masters/catalog`);
  const approvalQuery = useApi<Approval[]>(`${API_BASE}/approvals/`);
  const loading = catalogQuery.isLoading && !catalogQuery.data;
  const error = catalogQuery.error ? 'Unable to load master data.' : null;
  const rows = useMemo(() => {
    const catalog = catalogQuery.data ?? {};
    const approvals = Array.isArray(approvalQuery.data) ? approvalQuery.data : [];
    const pendingIds = (entity: string) =>
      new Set(
        approvals
          .filter((row) => row.status === 'Pending' && row.entity_type === entity && row.entity_id)
          .map((row) => row.entity_id as number),
      );
    const pendingCreates = (entity: string) =>
      approvals
        .filter((row) => row.status === 'Pending' && row.entity_type === entity && row.action === 'create')
        .map((row) => ({
          id: `pending-${row.id}`,
          name: row.payload?.name || 'New record',
          detail: 'Waiting for an admin',
          status: 'pending' as const,
        }));
    const mapRows = (entity: string, source: { id: number; name: string }[] | undefined) => {
      const pending = pendingIds(entity);
      return [
        ...pendingCreates(entity),
        ...(source ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          detail: entity === 'category' ? 'Category master' : entity === 'brand' ? 'Brand master' : 'Vendor master',
          status: (pending.has(row.id) ? 'pending' : 'active') as MasterStatus,
        })),
      ];
    };
    return {
      categories: mapRows('category', catalog.categories),
      brands: mapRows('brand', catalog.brands),
      vendors: mapRows('vendor', catalog.vendors),
    } satisfies Record<Tab, MasterRow[]>;
  }, [approvalQuery.data, catalogQuery.data]);

  const current = TABS.find((item) => item.id === tab) ?? TABS[0];

  return (
    <AppShell active="masters">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Master data</h1>
        <p className="mt-1 text-sm text-slate-500">Categories, brands, and vendors, including maker-checker status.</p>
      </div>
      <div className="mb-4 inline-flex rounded-full bg-white p-1 shadow-sm ring-1 ring-gray-100">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              tab === item.id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {error ? <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {loading ? (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-100 border-t-indigo-600" />
        </div>
      ) : (
        <MasterDataTable
          title={current.label}
          description="Search, filter, and page through this master list."
          rows={rows[tab]}
          searchPlaceholder={`Search ${current.label.toLowerCase()}...`}
          searchValue={(row) => `${row.name} ${row.detail}`}
          statusOf={(row) => row.status}
          columns={[
            { key: 'name', header: 'Name', render: (row) => <span className="font-medium text-slate-900">{row.name}</span> },
            { key: 'detail', header: 'Detail', render: (row) => row.detail },
          ]}
        />
      )}
    </AppShell>
  );
}
