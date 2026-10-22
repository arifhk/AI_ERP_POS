'use client';

import { useMemo, useState } from 'react';

export type PosCustomerRow = {
  id: string;
  firstName: string;
  phone: string;
  type: string;
  discount: number;
  doe: string;
  address: string;
  email: string;
  previousDue: number;
  loyaltyPoints: number;
};

export const SEED: PosCustomerRow[] = [
  { id: 'C-1001', firstName: 'Nadia', phone: '01711000001', type: 'VIP', discount: 10, doe: '2024-01-12', address: 'Bashundhara R/A', email: 'nadia@pluspoint.com', previousDue: 150, loyaltyPoints: 240 },
  { id: 'C-1002', firstName: 'Imran', phone: '01822000002', type: 'Regular', discount: 0, doe: '2024-06-03', address: 'Gulshan 2', email: 'imran@pluspoint.com', previousDue: 0, loyaltyPoints: 40 },
  { id: 'C-1003', firstName: 'Farhana', phone: '01933000003', type: 'VIP', discount: 5, doe: '2025-02-18', address: 'Dhanmondi 15', email: 'farhana@pluspoint.com', previousDue: 500, loyaltyPoints: 120 },
];

export function SearchCustomerModal({
  extraRows,
  onClose,
  onSelect,
}: {
  extraRows: PosCustomerRow[];
  onClose: () => void;
  onSelect: (customer: PosCustomerRow) => void;
}) {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => {
    const seen = new Set<string>();
    const merged = [...SEED, ...extraRows].filter((row) => {
      if (seen.has(row.id)) {
        return false;
      }
      seen.add(row.id);
      return true;
    });
    const term = query.trim().toLowerCase();
    if (!term) {
      return merged;
    }
    return merged.filter((row) =>
      [row.id, row.firstName, row.phone, row.type, row.address].some((value) => value.toLowerCase().includes(term)),
    );
  }, [extraRows, query]);

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-slate-900/50 p-3 sm:items-center">
      <div role="dialog" aria-modal="true" aria-labelledby="search-customer-title" className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl dark:bg-slate-800">
        <div className="flex items-center justify-between bg-slate-800 px-4 py-3 text-white">
          <h2 id="search-customer-title" className="text-base font-semibold">
            Customer Search
          </h2>
          <button type="button" onClick={onClose} className="min-h-[40px] rounded px-3 text-sm font-semibold text-slate-200 hover:bg-slate-700">
            Close
          </button>
        </div>
        <div className="border-b border-slate-200 p-3 dark:border-slate-700">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search customer id, name, or phone"
            className="min-h-[44px] w-full rounded border border-slate-300 px-3 text-sm outline-none focus:ring-2 focus:ring-orange-400/40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-100 text-xs font-semibold uppercase text-slate-600 dark:bg-slate-900 dark:text-slate-300">
              <tr>
                <th className="px-3 py-2">Customer ID</th>
                <th className="px-3 py-2">First Name</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">Discount (%)</th>
                <th className="px-3 py-2">DOE</th>
                <th className="px-3 py-2">Address</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    No customers match that search.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => onSelect(row)}
                    className="cursor-pointer border-t border-slate-100 hover:bg-orange-50 dark:border-slate-700 dark:hover:bg-slate-700/50"
                  >
                    <td className="px-3 py-2 font-medium">{row.id}</td>
                    <td className="px-3 py-2">{row.firstName}</td>
                    <td className="px-3 py-2">{row.phone}</td>
                    <td className="px-3 py-2">{row.type}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.discount}</td>
                    <td className="px-3 py-2">{row.doe}</td>
                    <td className="px-3 py-2">{row.address}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
