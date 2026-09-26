'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { AddButton, TableActions } from './TableActions';

export type MasterStatus = 'active' | 'pending' | 'inactive';

export type MasterColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
};

type MasterDataTableProps<T extends { id: string | number }> = {
  title: string;
  description?: string;
  rows: T[];
  columns: MasterColumn<T>[];
  searchPlaceholder?: string;
  searchValue: (row: T) => string;
  statusOf: (row: T) => MasterStatus;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  onToggleActive?: (row: T) => void;
  onToggleHidden?: (row: T) => void;
  isActive?: (row: T) => boolean;
  isHidden?: (row: T) => boolean;
  onAdd?: () => void;
  addLabel?: string;
  labelOf?: (row: T) => string;
  pageSize?: number;
};

const STATUS_LABEL: Record<MasterStatus, string> = {
  active: 'Active',
  pending: 'Pending Approval',
  inactive: 'Inactive',
};

export function StatusBadge({ status }: { status: MasterStatus }) {
  const tone =
    status === 'active'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
      : status === 'pending'
        ? 'bg-amber-50 text-amber-700 ring-amber-100'
        : 'bg-slate-100 text-slate-600 ring-slate-200';
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${tone}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function MasterDataTable<T extends { id: string | number }>({
  title,
  description,
  rows,
  columns,
  searchPlaceholder = 'Search...',
  searchValue,
  statusOf,
  onEdit,
  onDelete,
  onToggleActive,
  onToggleHidden,
  isActive,
  isHidden,
  onAdd,
  addLabel = 'Add New',
  pageSize = 8,
}: MasterDataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | MasterStatus>('all');
  const [page, setPage] = useState(1);
  const [jump, setJump] = useState('1');

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery = !term || searchValue(row).toLowerCase().includes(term);
      const matchesStatus = status === 'all' || statusOf(row) === status;
      return matchesQuery && matchesStatus;
    });
  }, [query, rows, searchValue, status, statusOf]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  function updateQuery(value: string) {
    setQuery(value);
    setPage(1);
    setJump('1');
  }

  function goTo(next: number) {
    const bounded = Math.min(pages, Math.max(1, next));
    setPage(bounded);
    setJump(String(bounded));
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-col gap-4 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-end sm:justify-between dark:border-slate-700">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {onAdd ? <AddButton label={addLabel} onClick={onAdd} /> : null}
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-full border border-gray-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 sm:w-64 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:bg-slate-900"
            />
          </label>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as 'all' | MasterStatus);
              setPage(1);
              setJump('1');
            }}
            className="rounded-full border border-gray-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending Approval</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800/80 dark:text-slate-200">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={`px-5 py-3 ${column.className ?? ''}`}>
                  {column.header}
                </th>
              ))}
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 2} className="px-5 py-12 text-center text-slate-500">
                  No records match this view.
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={row.id} className="border-gray-100 transition-colors hover:bg-slate-50/80 dark:border-slate-700 dark:hover:bg-slate-700/50">
                  {columns.map((column) => (
                    <td key={column.key} className={`px-5 py-3.5 text-slate-700 dark:text-slate-200 ${column.className ?? ''}`}>
                      {column.render(row)}
                    </td>
                  ))}
                  <td className="px-5 py-3.5">
                    <StatusBadge status={statusOf(row)} />
                  </td>
                  <td className="px-5 py-3.5">
                    <TableActions
                      active={isActive ? isActive(row) : true}
                      hidden={isHidden ? isHidden(row) : false}
                      onEdit={onEdit ? () => onEdit(row) : undefined}
                      onDelete={onDelete ? () => onDelete(row) : undefined}
                      onToggleActive={onToggleActive ? () => onToggleActive(row) : undefined}
                      onToggleHidden={onToggleHidden ? () => onToggleHidden(row) : undefined}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 text-sm dark:border-slate-700">
        <p className="text-slate-500">
          Page {safePage} of {pages} · {filtered.length} records
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <PagerButton label="First" disabled={safePage <= 1} onClick={() => goTo(1)} />
          <PagerButton label="Previous" disabled={safePage <= 1} onClick={() => goTo(safePage - 1)} />
          <PagerButton label="Next" disabled={safePage >= pages} onClick={() => goTo(safePage + 1)} />
          <PagerButton label="Last" disabled={safePage >= pages} onClick={() => goTo(pages)} />
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const next = Number(jump);
              if (Number.isInteger(next)) {
                goTo(next);
              }
            }}
          >
            <label htmlFor={`${title}-jump`} className="text-slate-500">
              Jump to page
            </label>
            <input
              id={`${title}-jump`}
              value={jump}
              onChange={(event) => setJump(event.target.value)}
              inputMode="numeric"
              className="w-16 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <button type="submit" className="rounded-full border border-gray-200 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700">
              Go
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

function PagerButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-full border border-gray-200 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
    >
      {label}
    </button>
  );
}
