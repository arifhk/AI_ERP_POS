'use client';

import { useEffect, useState } from 'react';

export function ReprintModal({
  onClose,
  onReprint,
}: {
  onClose: () => void;
  onReprint: (invoiceNumber: string) => void;
}) {
  const [invoiceNumber, setInvoiceNumber] = useState('');

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Shift') {
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-900/50 p-3">
      <div role="dialog" aria-modal="true" aria-labelledby="reprint-title" className="w-full max-w-md rounded-lg bg-white shadow-2xl dark:bg-slate-800">
        <div className="bg-orange-600 px-4 py-3 text-white">
          <h2 id="reprint-title" className="text-base font-semibold">
            Invoice Reprint
          </h2>
        </div>
        <div className="space-y-3 p-4">
          <label className="block text-xs font-semibold text-slate-500">
            Enter Invoice Number
            <input
              autoFocus
              value={invoiceNumber}
              onChange={(event) => setInvoiceNumber(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && invoiceNumber.trim()) {
                  event.preventDefault();
                  onReprint(invoiceNumber.trim());
                }
              }}
              className="mt-1 min-h-[48px] w-full rounded border border-slate-300 px-3 text-sm outline-none focus:ring-2 focus:ring-orange-400/40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <button
            type="button"
            onClick={() => invoiceNumber.trim() && onReprint(invoiceNumber.trim())}
            className="min-h-[48px] w-full rounded-md bg-orange-600 text-sm font-bold text-white"
          >
            Reprint
          </button>
          <p className="text-center text-xs font-medium text-slate-500">Press Shift to Cancel</p>
        </div>
      </div>
    </div>
  );
}
