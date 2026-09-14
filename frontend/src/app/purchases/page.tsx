'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Sidebar } from '../../components/Sidebar';
import { API_BASE, apiFetch } from '../../utils/api';

type Product = {
  id: number;
  name: string;
  barcode: string;
  stock_quantity: number;
  is_active: boolean;
};

type Purchase = {
  id: number;
  product_id: number;
  product_name: string;
  supplier_name: string;
  quantity_added: number;
  cost_price: number;
  date: string;
  created_by: string;
};

const emptyForm = {
  product_id: '',
  supplier_name: '',
  quantity_added: '1',
  cost_price: '',
};

function formatCurrency(amount: number) {
  return `৳ ${amount.toLocaleString('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPurchaseDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  async function loadPurchases() {
    const response = await apiFetch(`${API_BASE}/purchases/`);
    if (!response.ok) {
      throw new Error('Failed to load purchases');
    }
    const data: unknown = await response.json();
    setPurchases(Array.isArray(data) ? (data as Purchase[]) : []);
  }

  async function loadProducts() {
    const response = await apiFetch(`${API_BASE}/products/`);
    if (!response.ok) {
      throw new Error('Failed to load products');
    }
    const data: unknown = await response.json();
    const list = Array.isArray(data) ? (data as Product[]) : [];
    setProducts(list.filter((product) => product.is_active));
  }

  useEffect(() => {
    let cancelled = false;

    async function initialLoad() {
      try {
        await Promise.all([loadPurchases(), loadProducts()]);
      } catch {
        if (!cancelled) {
          setError('Unable to load stock entries from the server.');
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

  function openModal() {
    setForm({
      ...emptyForm,
      product_id: products[0] ? String(products[0].id) : '',
    });
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (submitting) {
      return;
    }
    setModalOpen(false);
    setFormError(null);
    setForm(emptyForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      const response = await apiFetch(`${API_BASE}/purchases/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: Number(form.product_id),
          supplier_name: form.supplier_name.trim(),
          quantity_added: Number(form.quantity_added),
          cost_price: Number(form.cost_price),
        }),
      });

      if (!response.ok) {
        let message = 'Could not receive stock.';
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

      setModalOpen(false);
      setForm(emptyForm);
      await Promise.all([loadPurchases(), loadProducts()]);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Could not receive stock.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar active="purchases" />

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
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-gray-800">Purchases</h1>
              <p className="mt-1 text-sm text-gray-500">
                Receive supplier stock. Quantities are added to product inventory automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={openModal}
              className="rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Receive Stock
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
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
                        >
                          Date
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
                        >
                          Product
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
                        >
                          Supplier
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500"
                        >
                          Qty Added
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500"
                        >
                          Cost Price
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
                        >
                          Created By
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {purchases.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500">
                            No stock entries yet. Receive stock to get started.
                          </td>
                        </tr>
                      ) : (
                        purchases.map((purchase) => (
                          <tr key={purchase.id} className="hover:bg-gray-50">
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                              {formatPurchaseDate(purchase.date)}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                              {purchase.product_name || `Product #${purchase.product_id}`}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                              {purchase.supplier_name}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-semibold text-gray-900">
                              +{purchase.quantity_added}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-900">
                              {formatCurrency(purchase.cost_price)}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                              {purchase.created_by}
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

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="receive-stock-title"
        >
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 id="receive-stock-title" className="text-lg font-semibold text-gray-900">
                Receive Stock
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Record a supplier delivery and increase on-hand quantity.
              </p>
            </div>

            <form onSubmit={(event) => void handleSubmit(event)} className="px-6 py-5">
              <div className="space-y-4">
                <div>
                  <label htmlFor="purchase-product" className="mb-1 block text-sm font-medium text-gray-700">
                    Product
                  </label>
                  <select
                    id="purchase-product"
                    required
                    value={form.product_id}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, product_id: event.target.value }))
                    }
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="" disabled>
                      Select a product
                    </option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} (Stock {product.stock_quantity})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="purchase-supplier" className="mb-1 block text-sm font-medium text-gray-700">
                    Supplier Name
                  </label>
                  <input
                    id="purchase-supplier"
                    required
                    value={form.supplier_name}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, supplier_name: event.target.value }))
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. Dhaka Wholesale Ltd."
                  />
                </div>
                <div>
                  <label htmlFor="purchase-qty" className="mb-1 block text-sm font-medium text-gray-700">
                    Quantity
                  </label>
                  <input
                    id="purchase-qty"
                    required
                    type="number"
                    min="1"
                    step="1"
                    value={form.quantity_added}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, quantity_added: event.target.value }))
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor="purchase-cost" className="mb-1 block text-sm font-medium text-gray-700">
                    Cost Price
                  </label>
                  <input
                    id="purchase-cost"
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.cost_price}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, cost_price: event.target.value }))
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {formError && (
                <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || products.length === 0}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
                >
                  {submitting ? 'Saving...' : 'Save Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
