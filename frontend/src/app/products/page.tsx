'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import dynamic from 'next/dynamic';
import { Sidebar } from '../../components/Sidebar';
import { LabelPrinter } from '../../components/LabelPrinter';
import { API_BASE, apiFetch } from '../../utils/api';

const Barcode = dynamic(() => import('react-barcode'), { ssr: false });

type Product = {
  id: number;
  name: string;
  barcode: string;
  price: number;
  stock_quantity: number;
  is_active: boolean;
};

type ProductForm = {
  name: string;
  sku: string;
  price: string;
  stock_quantity: string;
};

type EditorState = {
  mode: 'create' | 'edit';
  product: Product | null;
};

const emptyForm: ProductForm = {
  name: '',
  sku: '',
  price: '',
  stock_quantity: '',
};

function generateSku(existing: Set<string>) {
  let sku = '';
  do {
    const stamp = Date.now().toString().slice(-9);
    const suffix = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    sku = `${stamp}${suffix}`;
  } while (existing.has(sku));
  return sku;
}

function stockDisplay(quantity: number) {
  if (quantity <= 0) {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
        Out of Stock
      </span>
    );
  }
  if (quantity <= 5) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
        Low Stock
        <span className="font-bold">{quantity}</span>
      </span>
    );
  }
  return <span className="text-sm font-medium text-gray-700">{quantity}</span>;
}

function formatPrice(price: number) {
  return `৳ ${price.toLocaleString('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function readApiError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object' || !('detail' in payload)) {
    return fallback;
  }
  const detail = payload.detail;
  if (typeof detail === 'string') {
    return detail;
  }
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (first && typeof first === 'object' && 'msg' in first && typeof first.msg === 'string') {
      return first.msg;
    }
  }
  return fallback;
}

function ProductActions({
  onEdit,
  onPrint,
}: {
  onEdit: () => void;
  onPrint: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <button
        type="button"
        onClick={onEdit}
        className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={onPrint}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
      >
        <span aria-hidden="true">🏷️</span>
        Print Label
      </button>
    </div>
  );
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);

  async function loadProducts() {
    const response = await apiFetch(`${API_BASE}/products/?limit=200`);
    if (!response.ok) {
      throw new Error('Failed to load products');
    }

    const data: unknown = await response.json();
    setProducts(Array.isArray(data) ? (data as Product[]) : []);
  }

  useEffect(() => {
    let cancelled = false;

    async function initialLoad() {
      try {
        await loadProducts();
      } catch {
        if (!cancelled) {
          setError('Unable to load products from the server.');
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
    if (!editor) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) {
        setEditor(null);
        setFormError(null);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editor, submitting]);

  const filteredProducts = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return products;
    }
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(term) || product.barcode.toLowerCase().includes(term),
    );
  }, [products, query]);

  function openCreate() {
    const sku = generateSku(new Set(products.map((product) => product.barcode)));
    setForm({ ...emptyForm, sku });
    setFormError(null);
    setEditor({ mode: 'create', product: null });
  }

  function openEdit(product: Product) {
    setForm({
      name: product.name,
      sku: product.barcode,
      price: String(product.price),
      stock_quantity: String(product.stock_quantity),
    });
    setFormError(null);
    setEditor({ mode: 'edit', product });
  }

  function closeEditor() {
    if (submitting) {
      return;
    }
    setEditor(null);
    setFormError(null);
    setForm(emptyForm);
  }

  function regenerateSku() {
    const taken = new Set(products.map((product) => product.barcode));
    if (editor?.product) {
      taken.delete(editor.product.barcode);
    }
    setForm((current) => ({ ...current, sku: generateSku(taken) }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) {
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const payload = {
      name: form.name.trim(),
      barcode: form.sku.trim(),
      price: Number(form.price),
      stock_quantity: Number(form.stock_quantity),
    };

    try {
      const response =
        editor.mode === 'create'
          ? await apiFetch(`${API_BASE}/products/`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tenant_id: 1,
                branch_id: 1,
                is_active: true,
                ...payload,
              }),
            })
          : await apiFetch(`${API_BASE}/products/${editor.product?.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });

      if (!response.ok) {
        let message = editor.mode === 'create' ? 'Could not create the product.' : 'Could not update the product.';
        try {
          message = readApiError(await response.json(), message);
        } catch {
          // Keep the generic message if the error body is not JSON.
        }
        throw new Error(message);
      }

      setEditor(null);
      setForm(emptyForm);
      await loadProducts();
      setNotice(editor.mode === 'create' ? 'Product added successfully.' : 'Product updated successfully.');
    } catch (caught) {
      setFormError(
        caught instanceof Error
          ? caught.message
          : editor.mode === 'create'
            ? 'Could not create the product.'
            : 'Could not update the product.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  const skuValue = form.sku.trim();

  return (
    <div className="flex h-screen bg-gray-100">
      {navOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setNavOpen(false)}
        />
      ) : null}
      <div className={`${navOpen ? 'fixed inset-y-0 left-0 z-40 flex' : 'hidden'} md:static md:z-auto md:flex`}>
        <Sidebar active="products" onNavigate={() => setNavOpen(false)} className="h-full" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white p-3 sm:p-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setNavOpen(true)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-700 md:hidden"
            >
              <span aria-hidden="true" className="text-lg leading-none">
                ☰
              </span>
            </button>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name or SKU..."
              className="w-full min-w-0 max-w-md rounded-md border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex shrink-0 items-center space-x-3 sm:space-x-4">
            <button type="button" className="text-xl text-gray-500 hover:text-gray-700" aria-label="Notifications">
              🔔
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 font-bold text-white">
              AH
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-4 sm:p-6">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-800 sm:text-3xl">Products</h1>
              <p className="mt-1 text-sm text-gray-500">
                Manage catalog items, SKUs, pricing, and stock.
              </p>
            </div>
            <button
              type="button"
              onClick={openCreate}
              className="rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Add New Product
            </button>
          </div>

          {notice ? (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice(null)} className="font-semibold text-emerald-700">
                Dismiss
              </button>
            </div>
          ) : null}

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
                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Name</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">SKU</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Price</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Stock</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {filteredProducts.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500">
                            {products.length === 0
                              ? 'No products found. Add a product to get started.'
                              : 'No products match your search.'}
                          </td>
                        </tr>
                      ) : (
                        filteredProducts.map((product) => (
                          <tr key={product.id} className="hover:bg-gray-50">
                            <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                              {product.name}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 font-mono text-sm text-gray-600">
                              {product.barcode}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-gray-900">
                              {formatPrice(product.price)}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4">{stockDisplay(product.stock_quantity)}</td>
                            <td className="whitespace-nowrap px-6 py-4">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  product.is_active
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {product.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-right">
                              <ProductActions
                                onEdit={() => openEdit(product)}
                                onPrint={() => setBarcodeProduct(product)}
                              />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid gap-3 md:hidden">
                {filteredProducts.length === 0 ? (
                  <div className="rounded-lg border border-gray-100 bg-white px-4 py-12 text-center text-sm text-gray-500 shadow-sm">
                    {products.length === 0
                      ? 'No products found. Add a product to get started.'
                      : 'No products match your search.'}
                  </div>
                ) : (
                  filteredProducts.map((product) => (
                    <article
                      key={product.id}
                      className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="truncate text-base font-semibold text-gray-900">{product.name}</h2>
                          <p className="mt-1 font-mono text-xs text-gray-500">SKU {product.barcode}</p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                            product.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {product.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-gray-900">{formatPrice(product.price)}</p>
                        {stockDisplay(product.stock_quantity)}
                      </div>
                      <div className="mt-3 overflow-hidden rounded-md bg-gray-50 px-2 py-2 [&_svg]:h-auto [&_svg]:max-w-full">
                        <Barcode
                          value={product.barcode || String(product.id)}
                          format="CODE128"
                          width={1.1}
                          height={36}
                          fontSize={11}
                          margin={0}
                          displayValue
                          background="#f9fafb"
                          lineColor="#111827"
                        />
                      </div>
                      <div className="mt-3">
                        <ProductActions
                          onEdit={() => openEdit(product)}
                          onPrint={() => setBarcodeProduct(product)}
                        />
                      </div>
                    </article>
                  ))
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {editor ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="product-form-title">
          <button
            type="button"
            aria-label="Close product form"
            className="absolute inset-0 bg-black/50"
            onClick={closeEditor}
          />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h2 id="product-form-title" className="text-lg font-semibold text-gray-900">
                  {editor.mode === 'create' ? 'Add New Product' : 'Edit Product'}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Name, SKU, price, and stock. The barcode is generated from the SKU.
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                disabled={submitting}
                className="rounded-md px-2 py-1 text-sm font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-60"
              >
                Close
              </button>
            </div>

            <form onSubmit={(event) => void handleSubmit(event)} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
                <div>
                  <label htmlFor="product-name" className="mb-1 block text-sm font-medium text-gray-700">
                    Name
                  </label>
                  <input
                    id="product-name"
                    required
                    autoFocus
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. Espresso"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <label htmlFor="product-sku" className="block text-sm font-medium text-gray-700">
                      SKU
                    </label>
                    <button
                      type="button"
                      onClick={regenerateSku}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-500"
                    >
                      Generate SKU
                    </button>
                  </div>
                  <input
                    id="product-sku"
                    required
                    maxLength={80}
                    value={form.sku}
                    onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. 890123456789"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="product-price" className="mb-1 block text-sm font-medium text-gray-700">
                      Price
                    </label>
                    <input
                      id="product-price"
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.price}
                      onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label htmlFor="product-stock" className="mb-1 block text-sm font-medium text-gray-700">
                      Stock
                    </label>
                    <input
                      id="product-stock"
                      required
                      type="number"
                      min="0"
                      step="1"
                      value={form.stock_quantity}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, stock_quantity: event.target.value }))
                      }
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Barcode</p>
                  {skuValue ? (
                    <div className="overflow-hidden rounded-md bg-white px-2 py-3 [&_svg]:h-auto [&_svg]:max-w-full">
                      <Barcode
                        value={skuValue}
                        format="CODE128"
                        width={1.4}
                        height={56}
                        fontSize={12}
                        margin={0}
                        displayValue
                        background="#ffffff"
                        lineColor="#111827"
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Enter a SKU to generate a barcode.</p>
                  )}
                </div>

                {formError ? (
                  <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
                ) : null}
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-100 px-5 py-4">
                <button
                  type="button"
                  onClick={closeEditor}
                  disabled={submitting}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
                >
                  {submitting ? 'Saving...' : editor.mode === 'create' ? 'Save Product' : 'Update Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {barcodeProduct ? (
        <LabelPrinter product={barcodeProduct} onClose={() => setBarcodeProduct(null)} />
      ) : null}
    </div>
  );
}
