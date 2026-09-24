'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { LaserInvoice } from '../../components/LaserInvoice';
import {
  ThermalReceipt,
  formatPrice,
  formatReceiptDate,
  receiptTotals,
  type Receipt,
} from '../../components/ThermalReceipt';
import { AppShell } from '../../components/AppShell';
import { API_BASE, apiFetch } from '../../utils/api';
import { printWithMode } from '../../utils/print';

type PrintLayout = 'thermal' | 'laser';

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

function OrderActions({
  onDetails,
  onReprint,
  onReturn,
  returnDisabled,
}: {
  onDetails: () => void;
  onReprint: () => void;
  onReturn: () => void;
  returnDisabled: boolean;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <button
        type="button"
        onClick={onDetails}
        className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
      >
        View Details
      </button>
      <button
        type="button"
        onClick={onReprint}
        className="rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
      >
        Reprint Receipt
      </button>
      <button
        type="button"
        onClick={onReturn}
        disabled={returnDisabled}
        className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Process Return
      </button>
    </div>
  );
}

function OrderDetails({
  order,
  onClose,
  onReprint,
}: {
  order: Order;
  onClose: () => void;
  onReprint: () => void;
}) {
  const receipt = orderToReceipt(order);

  return (
    <div className="fixed inset-0 z-50 print:hidden" role="dialog" aria-modal="true" aria-labelledby="order-details-title">
      <button type="button" aria-label="Close order details" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 id="order-details-title" className="text-lg font-semibold text-gray-900">
              Order #{order.id}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {formatReceiptDate(order.created_at)}
              {order.customer_phone ? ` · ${order.customer_phone}` : ' · Walk-in'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
            {receipt.items.map((item, index) => (
              <li key={`${item.name}-${index}`} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{item.name}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {item.quantity} × {formatPrice(item.price)}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-gray-900">
                  {formatPrice(item.price * item.quantity)}
                </p>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <dt>Subtotal</dt>
              <dd>{formatPrice(receipt.subtotal)}</dd>
            </div>
            <div className="flex justify-between text-gray-600">
              <dt>VAT (5%)</dt>
              <dd>{formatPrice(receipt.vat)}</dd>
            </div>
            <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-semibold text-gray-900">
              <dt>Total</dt>
              <dd>{formatPrice(receipt.grandTotal)}</dd>
            </div>
          </dl>
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onReprint}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Reprint Receipt
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [query, setQuery] = useState('');
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [printLayout, setPrintLayout] = useState<PrintLayout>('thermal');

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

  const filteredOrders = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return orders;
    }
    return orders.filter((order) => {
      const itemNames = (order.items ?? []).map((item) => item.name ?? '').join(' ');
      const haystack = `${order.id} ${order.customer_phone ?? ''} ${itemNames}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [orders, query]);

  useEffect(() => {
    if (!detailOrder && !receipt && !returnOrder) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || returnSubmitting) {
        return;
      }
      if (receipt) {
        setReceipt(null);
        return;
      }
      if (returnOrder) {
        setReturnOrder(null);
        return;
      }
      setDetailOrder(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [detailOrder, receipt, returnOrder, returnSubmitting]);

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

  function openReprint(order: Order, layout: PrintLayout = 'thermal') {
    setPrintLayout(layout);
    setReceipt(orderToReceipt(order));
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

  const emptyMessage =
    orders.length === 0 ? 'No sales recorded yet.' : 'No orders match your search.';

  return (
    <>
      <AppShell
        active="orders"
        className="print:hidden"
        header={
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search order, phone, or item..."
            className="w-full min-w-0 max-w-md rounded-md border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        }
      >
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-gray-800 sm:text-3xl">Sales History</h1>
                <p className="mt-1 text-sm text-gray-500">
                  Completed POS transactions, with thermal and A4 reprints.
                </p>
              </div>
              <button
                type="button"
                onClick={() => exportOrdersToCsv(filteredOrders)}
                disabled={loading || filteredOrders.length === 0}
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

                <div className="hidden overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm md:block">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Order ID</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Date & Time</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Items</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Total</th>
                          <th scope="col" className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {filteredOrders.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">
                              {emptyMessage}
                            </td>
                          </tr>
                        ) : (
                          filteredOrders.map((order) => {
                            const summary = orderToReceipt(order);
                            const units = summary.items.reduce((sum, item) => sum + item.quantity, 0);
                            return (
                              <tr key={order.id} className="hover:bg-gray-50">
                                <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                                  #{order.id}
                                </td>
                                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                                  {formatReceiptDate(order.created_at)}
                                </td>
                                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                                  {units} {units === 1 ? 'unit' : 'units'}
                                </td>
                                <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-gray-900">
                                  {formatPrice(summary.grandTotal)}
                                </td>
                                <td className="whitespace-nowrap px-6 py-4 text-right">
                                  <OrderActions
                                    onDetails={() => setDetailOrder(order)}
                                    onReprint={() => openReprint(order)}
                                    onReturn={() => openReturnModal(order)}
                                    returnDisabled={!order.items?.length}
                                  />
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid gap-3 md:hidden">
                  {filteredOrders.length === 0 ? (
                    <div className="rounded-lg border border-gray-100 bg-white px-4 py-12 text-center text-sm text-gray-500 shadow-sm">
                      {emptyMessage}
                    </div>
                  ) : (
                    filteredOrders.map((order) => {
                      const summary = orderToReceipt(order);
                      const units = summary.items.reduce((sum, item) => sum + item.quantity, 0);
                      return (
                        <article key={order.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h2 className="text-base font-semibold text-gray-900">Order #{order.id}</h2>
                              <p className="mt-1 text-xs text-gray-500">{formatReceiptDate(order.created_at)}</p>
                            </div>
                            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                              Completed
                            </span>
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <p className="text-sm text-gray-600">
                              {units} {units === 1 ? 'unit' : 'units'}
                              {order.customer_phone ? ` · ${order.customer_phone}` : ''}
                            </p>
                            <p className="text-sm font-semibold text-gray-900">{formatPrice(summary.grandTotal)}</p>
                          </div>
                          <div className="mt-3">
                            <OrderActions
                              onDetails={() => setDetailOrder(order)}
                              onReprint={() => openReprint(order)}
                              onReturn={() => openReturnModal(order)}
                              returnDisabled={!order.items?.length}
                            />
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </>
            )}
      </AppShell>

      {detailOrder ? (
        <OrderDetails
          order={detailOrder}
          onClose={() => setDetailOrder(null)}
          onReprint={() => openReprint(detailOrder)}
        />
      ) : null}

      {receipt ? (
        <>
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 print:hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-receipt-title"
          >
            <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
                <div>
                  <h2 id="history-receipt-title" className="text-lg font-semibold text-gray-900">
                    Reprint receipt
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Order #{receipt.orderId}. Choose the thermal or laser layout.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReceipt(null)}
                  className="rounded-md px-2 py-1 text-sm font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                >
                  Close
                </button>
              </div>
              <div className="flex gap-2 border-b border-gray-100 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setPrintLayout('thermal')}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
                    printLayout === 'thermal'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Thermal (80mm)
                </button>
                <button
                  type="button"
                  onClick={() => setPrintLayout('laser')}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
                    printLayout === 'laser'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Laser (A4)
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto bg-neutral-100 p-4">
                <div className="mx-auto w-max max-w-full rounded-sm border border-neutral-300 bg-white shadow-sm">
                  {printLayout === 'thermal' ? (
                    <ThermalReceipt receipt={receipt} />
                  ) : (
                    <LaserInvoice receipt={receipt} />
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-3 border-t border-gray-100 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setReceipt(null)}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => printWithMode(printLayout === 'thermal' ? 'receipt' : 'a4')}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                >
                  {printLayout === 'thermal' ? 'Print 80mm receipt' : 'Print A4 invoice'}
                </button>
              </div>
            </div>
          </div>
          {printLayout === 'thermal'
            ? createPortal(
                <div id="thermal-receipt-host" className="hidden print:block">
                  <ThermalReceipt receipt={receipt} printRoot />
                </div>,
                document.body,
              )
            : createPortal(
                <div id="laser-invoice-host" className="hidden print:block">
                  <LaserInvoice receipt={receipt} printRoot />
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
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white shadow-xl">
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
