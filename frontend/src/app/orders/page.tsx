'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  ThermalReceipt,
  formatPrice,
  formatReceiptDate,
  receiptTotals,
  type Receipt,
} from '../../components/ThermalReceipt';
import { Sidebar } from '../../components/Sidebar';
import { API_BASE, apiFetch } from '../../utils/api';
import { printWithMode } from '../../utils/print';

type OrderItem = {
  id: number;
  product_id: number;
  quantity: number;
  price: number;
  name?: string;
};

type Order = {
  id: number;
  tenant_id: number;
  branch_id: number;
  total_amount: number;
  created_at: string;
  customer_phone?: string | null;
  items: OrderItem[];
};

function orderToReceipt(order: Order): Receipt {
  const items = (order.items ?? []).map((item) => ({
    name: item.name?.trim() ? item.name : `Product #${item.product_id}`,
    quantity: item.quantity,
    price: item.price,
  }));
  const totals = receiptTotals(items);
  return {
    orderId: order.id,
    createdAt: order.created_at,
    customerPhone: order.customer_phone ?? null,
    items,
    ...totals,
  };
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [returnOrder, setReturnOrder] = useState<Order | null>(null);
  const [returnProductId, setReturnProductId] = useState('');
  const [returnQty, setReturnQty] = useState('1');
  const [returnAmount, setReturnAmount] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [returnError, setReturnError] = useState<string | null>(null);
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function loadOrders() {
    const response = await apiFetch(`${API_BASE}/orders/`);
    if (!response.ok) {
      throw new Error('Failed to load orders');
    }
    const data: unknown = await response.json();
    setOrders(Array.isArray(data) ? (data as Order[]) : []);
  }

  useEffect(() => {
    let cancelled = false;

    async function initialLoad() {
      try {
        await loadOrders();
      } catch {
        if (!cancelled) {
          setError('Unable to load orders from the server.');
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

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function selectedReturnItem(order: Order) {
    return order.items.find((item) => String(item.product_id) === returnProductId) ?? order.items[0];
  }

  function openReturnModal(order: Order) {
    const first = order.items[0];
    setReturnOrder(order);
    setReturnProductId(first ? String(first.product_id) : '');
    setReturnQty('1');
    setReturnAmount(first ? (first.price * 1).toFixed(2) : '');
    setReturnReason('');
    setReturnError(null);
  }

  function closeReturnModal() {
    if (returnSubmitting) {
      return;
    }
    setReturnOrder(null);
    setReturnError(null);
  }

  function applyReturnItem(order: Order, productId: string) {
    const item = order.items.find((row) => String(row.product_id) === productId);
    setReturnProductId(productId);
    const qty = Math.max(1, Number(returnQty) || 1);
    if (item) {
      const capped = Math.min(qty, item.quantity);
      setReturnQty(String(capped));
      setReturnAmount((item.price * capped).toFixed(2));
    }
  }

  async function handleReturnSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!returnOrder) {
      return;
    }
    setReturnSubmitting(true);
    setReturnError(null);

    try {
      const response = await apiFetch(`${API_BASE}/returns/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: returnOrder.id,
          product_id: Number(returnProductId),
          quantity_returned: Number(returnQty),
          refund_amount: Number(returnAmount),
          reason: returnReason.trim(),
        }),
      });

      if (!response.ok) {
        let message = 'Could not process the return.';
        try {
          const payload = (await response.json()) as { detail?: unknown };
          if (typeof payload.detail === 'string') {
            message = payload.detail;
          }
        } catch {
          // Keep the generic message if the error body is not JSON.
        }
        throw new Error(message);
      }

      setReturnOrder(null);
      setToast('Return processed. Stock has been restocked.');
      await loadOrders();
    } catch (caught) {
      setReturnError(caught instanceof Error ? caught.message : 'Could not process the return.');
    } finally {
      setReturnSubmitting(false);
    }
  }

  function csvCell(value: string | number) {
    const text = String(value);
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function exportOrdersToCsv(rows: Order[]) {
    const header = ['Order ID', 'Date', 'Total Amount'];
    const body = rows.map((order) => [
      csvCell(order.id),
      csvCell(formatReceiptDate(order.created_at)),
      csvCell(order.total_amount.toFixed(2)),
    ].join(','));
    const csv = `\uFEFF${[header.join(','), ...body].join('\r\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sales_report.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="flex h-screen bg-gray-100 print:hidden">
        <Sidebar active="orders" />

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
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold text-gray-800">Sales History</h1>
                <p className="mt-1 text-sm text-gray-500">Review past POS orders and reprint thermal receipts.</p>
              </div>
              <button
                type="button"
                onClick={() => exportOrdersToCsv(orders)}
                disabled={loading || orders.length === 0}
                className="rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-emerald-300"
              >
                Export to CSV
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
                          <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Order ID</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Date & Time</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Total Amount</th>
                          <th scope="col" className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {orders.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-6 py-12 text-center text-sm text-gray-500">
                              No sales recorded yet.
                            </td>
                          </tr>
                        ) : (
                          orders.map((order) => (
                            <tr key={order.id} className="hover:bg-gray-50">
                              <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                                #{order.id}
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                                {formatReceiptDate(order.created_at)}
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-gray-900">
                                {formatPrice(order.total_amount)}
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-right">
                                <div className="inline-flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setReceipt(orderToReceipt(order))}
                                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                                  >
                                    View/Print
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openReturnModal(order)}
                                    disabled={!order.items?.length}
                                    className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Process Return
                                  </button>
                                </div>
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
      </div>

      {receipt ? (
        <>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-receipt-title"
          >
            <div className="flex flex-col items-center rounded-xl bg-neutral-100 p-5 shadow-2xl">
              <p id="history-receipt-title" className="sr-only">
                Order receipt
              </p>
              <div className="rounded-sm border border-neutral-300 bg-white shadow-sm">
                <ThermalReceipt receipt={receipt} />
              </div>
              <div className="mt-4 flex w-[80mm] max-w-[80mm] gap-2">
                <button
                  type="button"
                  onClick={() => printWithMode('receipt')}
                  className="flex-1 rounded-md border border-gray-800 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                >
                  Print Receipt
                </button>
                <button
                  type="button"
                  onClick={() => setReceipt(null)}
                  className="flex-1 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
          {createPortal(
            <div id="thermal-receipt-host" className="hidden print:block">
              <ThermalReceipt receipt={receipt} printRoot />
            </div>,
            document.body,
          )}
        </>
      ) : null}

      {returnOrder ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="process-return-title"
        >
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 id="process-return-title" className="text-lg font-semibold text-gray-900">
                Process Return
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Order #{returnOrder.id}. Returned units are added back to stock.
              </p>
            </div>
            <form onSubmit={(event) => void handleReturnSubmit(event)} className="px-6 py-5">
              <div className="space-y-4">
                <div>
                  <label htmlFor="return-item" className="mb-1 block text-sm font-medium text-gray-700">
                    Item
                  </label>
                  <select
                    id="return-item"
                    required
                    value={returnProductId}
                    onChange={(event) => applyReturnItem(returnOrder, event.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {returnOrder.items.map((item) => (
                      <option key={`${item.id}-${item.product_id}`} value={item.product_id}>
                        {(item.name?.trim() ? item.name : `Product #${item.product_id}`)} × {item.quantity}{' '}
                        ({formatPrice(item.price)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="return-qty" className="mb-1 block text-sm font-medium text-gray-700">
                    Quantity returned
                  </label>
                  <input
                    id="return-qty"
                    required
                    type="number"
                    min="1"
                    max={selectedReturnItem(returnOrder)?.quantity ?? 1}
                    step="1"
                    value={returnQty}
                    onChange={(event) => {
                      const nextQty = event.target.value;
                      setReturnQty(nextQty);
                      const item = selectedReturnItem(returnOrder);
                      const parsed = Number(nextQty);
                      if (item && Number.isFinite(parsed) && parsed > 0) {
                        setReturnAmount((item.price * parsed).toFixed(2));
                      }
                    }}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor="return-amount" className="mb-1 block text-sm font-medium text-gray-700">
                    Refund amount
                  </label>
                  <input
                    id="return-amount"
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={returnAmount}
                    onChange={(event) => setReturnAmount(event.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor="return-reason" className="mb-1 block text-sm font-medium text-gray-700">
                    Reason
                  </label>
                  <input
                    id="return-reason"
                    required
                    value={returnReason}
                    onChange={(event) => setReturnReason(event.target.value)}
                    placeholder="e.g. Size mismatch"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {returnError && (
                <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{returnError}</p>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeReturnModal}
                  disabled={returnSubmitting}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={returnSubmitting || !returnOrder.items.length}
                  className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-amber-300"
                >
                  {returnSubmitting ? 'Saving...' : 'Confirm Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          className="fixed bottom-6 right-6 z-[60] rounded-lg bg-emerald-700 px-4 py-3 text-sm font-medium text-white shadow-lg print:hidden"
          role="status"
        >
          {toast}
        </div>
      ) : null}
    </>
  );
}
