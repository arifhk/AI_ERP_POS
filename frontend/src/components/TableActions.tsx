'use client';

import { useState, type ReactNode } from 'react';
import { CheckCircle2, Eye, EyeOff, Pencil, Plus, Trash2, XCircle } from 'lucide-react';

export function ActionIcon({
  label,
  className,
  onClick,
  children,
}: {
  label: string;
  className: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);

  function show(target: HTMLElement) {
    const rect = target.getBoundingClientRect();
    setTip({ x: rect.left + rect.width / 2, y: rect.top });
  }

  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      onMouseEnter={(event) => show(event.currentTarget)}
      onMouseLeave={() => setTip(null)}
      onFocus={(event) => show(event.currentTarget)}
      onBlur={() => setTip(null)}
      className={`rounded-full p-2 text-slate-400 transition ${className}`}
    >
      {children}
      {tip ? (
        <span
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg"
          style={{ left: tip.x, top: tip.y - 6 }}
        >
          {label}
        </span>
      ) : null}
    </button>
  );
}

export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
    >
      <Plus className="h-4 w-4" strokeWidth={1.5} />
      {label}
    </button>
  );
}

export function TableActions({
  active = true,
  hidden = false,
  onEdit,
  onDelete,
  onToggleActive,
  onToggleHidden,
  extra,
}: {
  active?: boolean;
  hidden?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onToggleActive?: () => void;
  onToggleHidden?: () => void;
  extra?: ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <div className="flex items-center justify-end gap-0.5">
        {onEdit ? (
          <ActionIcon label="Edit Item" className="hover:bg-blue-50 hover:text-blue-600" onClick={onEdit}>
            <Pencil className="h-4 w-4" strokeWidth={1.5} />
          </ActionIcon>
        ) : null}
        {onToggleActive ? (
          <ActionIcon
            label={active ? 'Make Inactive' : 'Make Active'}
            className={active ? 'hover:bg-orange-50 hover:text-orange-500' : 'hover:bg-emerald-50 hover:text-emerald-600'}
            onClick={onToggleActive}
          >
            {active ? <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} /> : <XCircle className="h-4 w-4" strokeWidth={1.5} />}
          </ActionIcon>
        ) : null}
        {onToggleHidden ? (
          <ActionIcon
            label={hidden ? 'Show in POS' : 'Hide from POS'}
            className="hover:bg-slate-100 hover:text-slate-800"
            onClick={onToggleHidden}
          >
            {hidden ? <EyeOff className="h-4 w-4" strokeWidth={1.5} /> : <Eye className="h-4 w-4" strokeWidth={1.5} />}
          </ActionIcon>
        ) : null}
        {extra}
        {onDelete ? (
          <ActionIcon label="Delete Item" className="hover:bg-red-50 hover:text-red-600" onClick={() => setConfirming(true)}>
            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
          </ActionIcon>
        ) : null}
      </div>
      {confirming ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" aria-label="Cancel delete" className="absolute inset-0 bg-slate-900/40" onClick={() => setConfirming(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-gray-100 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Delete this record?</h3>
            <p className="mt-2 text-sm text-slate-600">Are you sure you want to delete this? This action might affect linked products.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-slate-700">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  onDelete?.();
                }}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
