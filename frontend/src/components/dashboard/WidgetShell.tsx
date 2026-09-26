'use client';

import { GripVertical, Maximize2, X } from 'lucide-react';
import { useEffect, useState, type HTMLAttributes, type ReactNode } from 'react';

export type DragHandleProps = HTMLAttributes<HTMLButtonElement>;

type WidgetShellProps = {
  title: string;
  subtitle?: string;
  dragHandleProps?: DragHandleProps;
  children: ReactNode;
  detail: ReactNode;
  className?: string;
};

export function WidgetShell({ title, subtitle, dragHandleProps, children, detail, className = '' }: WidgetShellProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <article className={`flex h-full flex-col rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 ${className}`}>
        <header className="mb-3 flex items-start gap-2">
          <button
            type="button"
            aria-label={`Drag ${title}`}
            className="mt-0.5 cursor-grab rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            {...dragHandleProps}
          >
            <GripVertical className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
            {subtitle ? <p className="truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            aria-label={`Expand ${title}`}
            onClick={() => setOpen(true)}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-100"
          >
            <Maximize2 className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </header>
        <div className="min-h-0 flex-1">{children}</div>
      </article>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-2xl border border-gray-100 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
                {subtitle ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {detail}
          </div>
        </div>
      ) : null}
    </>
  );
}

export function DataTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  if (rows.length === 0) {
    return <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Nothing to show for this period.</p>;
  }
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-gray-100 dark:border-slate-700">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800/80 dark:text-slate-200">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-3 py-2 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-slate-100 dark:border-slate-700 dark:hover:bg-slate-700/50">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2 text-slate-700 dark:text-slate-100">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
