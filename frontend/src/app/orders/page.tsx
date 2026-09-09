'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ThermalReceipt,
  formatPrice,
  formatReceiptDate,
  receiptTotals,
  type Receipt,
} from '../../components/ThermalReceipt';

const API_BASE = 'http://localhost:8000';

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
    items,
    ...totals,
  };
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadOrders() {
      try {
        const response = await fetch(`${API_BASE}/orders/`);
        if (!response.ok) {
          throw new Error('Failed to load orders');
        }
        const data: unknown = await response.json();
        if (!cancelled) {
          setOrders(Array.isArray(data) ? (data as Order[]) : []);
        }
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

    loadOrders();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div className="flex h-screen bg-gray-100 print:hidden">
        <aside className="w-64 bg-gray-900 text-white flex flex-col">
          <div className="p-6 text-2xl font-bold border-b border-gray-800">
            AI ERP & POS
          </div>
          <nav className="flex-1 p-4 space-y-2">
            <Link href="/" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700">Dashboard</Link>
            <Link href="/tenants" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700">Tenants</Link>
            <Link href="/branches" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700">Branches</Link>
            <Link href="/users" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700">Users</Link>
            <Link href="/products" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700">Products</Link>
            <Link href="/pos" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700">POS</Link>
            <Link href="/orders" className="block py-2.5 px-4 rounded transition duration-200 bg-gray-800 hover:bg-gray-700">Orders</Link>
            <Link href="/settings" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700">Settings</Link>
          </nav>
        </aside>

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
            <div className="mb-6">
              <h1 className="text-3xl font-semibold text-gray-800">Sales History</h1>
              <p className="mt-1 text-sm text-gray-500">Review past POS orders and reprint thermal receipts.</p>
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
                                <button
                                  type="button"
                                  onClick={() => setReceipt(orderToReceipt(order))}
                                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                                >
                                  View/Print
                                </button>
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

      {receipt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:static print:bg-transparent print:p-0"
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-receipt-title"
        >
          <div className="flex flex-col items-center">
            <p id="history-receipt-title" className="sr-only">
              Order receipt
            </p>
            <ThermalReceipt receipt={receipt} />
            <div className="mt-4 flex w-full max-w-xs gap-2 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 rounded-md border border-gray-800 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
              >
                Print
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
      )}
    </>
  );
}
