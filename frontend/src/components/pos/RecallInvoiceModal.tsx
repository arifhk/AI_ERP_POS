'use client';

import { useEffect, useState } from 'react';

export type HeldCustomer = {
  id: string | number | null;
  code: string;
  name: string;
  phone: string;
  address: string;
};

export type HeldCartLine = {
  id: string;
  barcode: string;
  name: string;
  price: number;
  qty: number;
  vat: number;
  disc: number;
};

export type HeldInvoice = {
  id: string;
  timestamp: string;
  itemCount: number;
  totalAmount: number;
  cart: HeldCartLine[];
  customer: HeldCustomer;
  orderDiscountPercent: string;
  orderDiscountAmount: string;
  returnAmount: number;
};

function money(amount: number) {
  const [whole, fraction] = Math.abs(amount).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${amount < 0 ? '-' : ''}${grouped}.${fraction}`;
}

function formatHeldTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return value;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function customerInfo(customer: HeldCustomer | undefined) {
  const parts = [customer?.name?.trim(), customer?.phone?.trim(), customer?.code?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Walk-in';
}

function lineAmount(line: HeldCartLine) {
  const gross = line.price * line.qty;
  const discounted = gross - gross * ((line.disc || 0) / 100);
  return discounted + discounted * ((line.vat || 0) / 100);
}

export function RecallInvoiceModal({
  invoices,
  onClose,
  onRestore,
  onDelete,
}: {
  invoices: HeldInvoice[];
  onClose: () => void;
  onRestore: (invoice: HeldInvoice) => void;
  onDelete: (id: string) => void;
}) {
  const [previewInvoice, setPreviewInvoice] = useState<HeldInvoice | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape' && event.key !== 'Shift') {
        return;
      }
      if (previewInvoice) {
        setPreviewInvoice(null);
        return;
      }
      onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, previewInvoice]);

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-900/50 p-3">
      <div role="dialog" aria-modal="true" aria-labelledby="recall-title" className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl dark:bg-slate-800">
        <div className="flex items-center justify-between bg-indigo-700 px-4 py-3 text-white">
          <h2 id="recall-title" className="text-base font-semibold">
            Held Invoices List
          </h2>
          <button type="button" onClick={onClose} className="min-h-9 rounded-md px-3 text-sm font-semibold text-indigo-100 hover:bg-indigo-600">
            Close
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {invoices.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">No invoices are on hold.</p>
          ) : (
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                <tr>
                  <th className="px-3 py-2">Date/Time</th>
                  <th className="px-3 py-2">Customer Info</th>
                  <th className="px-3 py-2 text-right">Total Items</th>
                  <th className="px-3 py-2 text-right">Total Amount</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="px-3 py-2 whitespace-nowrap text-slate-700 dark:text-slate-200">{formatHeldTime(invoice.timestamp)}</td>
                    <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{customerInfo(invoice.customer)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{invoice.itemCount}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(invoice.totalAmount)}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setPreviewInvoice(invoice)}
                          className="min-h-9 rounded-md bg-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-300 dark:bg-slate-600 dark:text-slate-100 dark:hover:bg-slate-500"
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => onRestore(invoice)}
                          className="min-h-9 rounded-md bg-sky-600 px-3 text-xs font-bold text-white hover:bg-sky-700"
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(invoice.id)}
                          className="min-h-9 rounded-md bg-rose-600 px-3 text-xs font-bold text-white hover:bg-rose-700"
                        >
                          Discard
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {previewInvoice ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/60 p-3">
          <div role="dialog" aria-modal="true" aria-labelledby="preview-title" className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl dark:bg-slate-800">
            <div className="flex items-center justify-between bg-indigo-700 px-4 py-3 text-white">
              <h2 id="preview-title" className="text-base font-semibold">
                Invoice Preview
              </h2>
              <span className="text-xs font-medium text-indigo-100">{formatHeldTime(previewInvoice.timestamp)}</span>
            </div>
            <div className="grid grid-cols-1 gap-1 border-b border-slate-200 px-4 py-3 text-sm sm:grid-cols-2 dark:border-slate-700">
              <p className="text-slate-800 dark:text-slate-100">
                <span className="font-semibold text-slate-500 dark:text-slate-400">Customer </span>
                {previewInvoice.customer?.name?.trim() || 'Walk-in'}
              </p>
              <p className="text-slate-800 dark:text-slate-100">
                <span className="font-semibold text-slate-500 dark:text-slate-400">Phone </span>
                {previewInvoice.customer?.phone?.trim() || '—'}
              </p>
              <p className="text-slate-800 dark:text-slate-100">
                <span className="font-semibold text-slate-500 dark:text-slate-400">Code </span>
                {previewInvoice.customer?.code?.trim() || '—'}
              </p>
              <p className="text-slate-800 dark:text-slate-100">
                <span className="font-semibold text-slate-500 dark:text-slate-400">Address </span>
                {previewInvoice.customer?.address?.trim() || '—'}
              </p>
            </div>
            <div className="max-h-[50vh] overflow-y-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="sticky top-0 bg-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                  <tr>
                    <th className="px-3 py-2">SL</th>
                    <th className="px-3 py-2">Item Name</th>
                    <th className="px-3 py-2">Barcode</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Unit Price</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {previewInvoice.cart.map((line, index) => (
                    <tr key={line.id} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="px-3 py-2 tabular-nums text-slate-500">{index + 1}</td>
                      <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{line.name}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300">{line.barcode || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{line.qty}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(line.price)}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(lineAmount(line))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Total Bill Amount <span className="ml-2 tabular-nums text-base">{money(previewInvoice.totalAmount)}</span>
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewInvoice(null)}
                  className="min-h-9 rounded-md bg-rose-600 px-3 text-xs font-bold text-white hover:bg-rose-700"
                >
                  Close Preview
                </button>
                <button
                  type="button"
                  onClick={() => onRestore(previewInvoice)}
                  className="min-h-9 rounded-md bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  Restore This Invoice
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
