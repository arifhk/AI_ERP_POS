'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { Copy, History, Tag } from 'lucide-react';
import { AppShell } from '../../components/AppShell';
import { ActionIcon, AddButton, TableActions } from '../../components/TableActions';
import { LabelPrinter } from '../../components/LabelPrinter';
import { ApprovalInbox } from '../../components/ApprovalInbox';
import { BulkProductImport } from '../../components/BulkProductImport';
import { ProductEditor, cloneCatalogProduct, type CatalogProduct } from '../../components/ProductEditor';
import { API_BASE, apiFetch } from '../../utils/api';
import { useApi } from '../../utils/query';

const Barcode = dynamic(() => import('react-barcode'), { ssr: false });

type EditorState = {
  mode: 'create' | 'edit';
  product: CatalogProduct | null;
};

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

function itemCodeOf(product: CatalogProduct) {
  return product.item_code || product.design_code || product.barcode;
}

type AuditEntry = {
  id: number;
  user_name: string;
  action_type: string;
  changes: Record<string, { old?: unknown; new?: unknown }>;
  reason?: string | null;
  method: string;
  created_at: string;
};

type ProductTable = {
  items?: CatalogProduct[];
  total?: number;
  page?: number;
  pages?: number;
  categories?: string[];
};

export default function ProductsPage() {
  const searchParams = useSearchParams();
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [jump, setJump] = useState('1');
  const tableKey = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: '10',
    });
    if (query.trim()) {
      params.set('q', query.trim());
    }
    if (statusFilter !== 'all') {
      params.set('status', statusFilter);
    }
    if (categoryFilter) {
      params.set('category', categoryFilter);
    }
    return `${API_BASE}/products/table?${params.toString()}`;
  }, [categoryFilter, page, query, statusFilter]);
  const { data, error: loadError, isLoading, mutate } = useApi<ProductTable>(tableKey);
  const products = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;
  const categories = data?.categories ?? [];
  const loading = isLoading && !data;
  const error = loadError ? 'Unable to load products from the server.' : null;
  const [historyProduct, setHistoryProduct] = useState<CatalogProduct | null>(null);
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [barcodeProduct, setBarcodeProduct] = useState<CatalogProduct | null>(null);

  useEffect(() => {
    const preset = searchParams.get('q');
    if (preset) {
      setPage(1);
      setQuery(preset);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setEditor(null);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editor]);

  const filteredProducts = products;

  async function openHistory(product: CatalogProduct) {
    setHistoryProduct(product);
    setHistory([]);
    const response = await apiFetch(`${API_BASE}/products/${product.id}/history`);
    if (!response.ok) {
      return;
    }
    const data: unknown = await response.json();
    setHistory(Array.isArray(data) ? (data as AuditEntry[]) : []);
  }

  function openCreate() {
    setEditor({ mode: 'create', product: null });
  }

  function openEdit(product: CatalogProduct) {
    setEditor({ mode: 'edit', product });
  }

  function openClone(product: CatalogProduct) {
    const taken = new Set(products.map((item) => item.barcode));
    setEditor({ mode: 'create', product: cloneCatalogProduct(product, taken) });
  }

  async function changeProduct(product: CatalogProduct, path: string, init: RequestInit, fallback: string) {
    const response = await apiFetch(`${API_BASE}/products/${product.id}${path}`, init);
    if (!response.ok) {
      toast.error(fallback);
      return;
    }
    const payload = (await response.json()) as { pending?: boolean; message?: string };
    toast.success(payload.pending ? 'Submitted for Admin Approval' : payload.message || 'Updated');
    try {
      await mutate();
    } catch {
      toast.error('Unable to load products from the server.');
    }
  }

  function toggleProduct(product: CatalogProduct, field: 'is_active' | 'is_hidden', value: boolean) {
    void changeProduct(
      product,
      '/flags',
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: value }) },
      'Could not update this product.',
    );
  }

  function productActions(product: CatalogProduct) {
    return (
      <TableActions
        active={product.is_active}
        hidden={product.is_hidden === true}
        onEdit={() => openEdit(product)}
        onDelete={() => void changeProduct(product, '', { method: 'DELETE' }, 'Could not delete this product.')}
        onToggleActive={() => toggleProduct(product, 'is_active', !product.is_active)}
        onToggleHidden={() => toggleProduct(product, 'is_hidden', product.is_hidden !== true)}
        extra={
          <>
            <ActionIcon label="Clone Item" className="hover:bg-slate-100 hover:text-slate-800" onClick={() => openClone(product)}>
              <Copy className="h-4 w-4" strokeWidth={1.5} />
            </ActionIcon>
            <ActionIcon label="Print Label" className="hover:bg-slate-100 hover:text-slate-800" onClick={() => setBarcodeProduct(product)}>
              <Tag className="h-4 w-4" strokeWidth={1.5} />
            </ActionIcon>
            <ActionIcon label="View History" className="hover:bg-slate-100 hover:text-slate-800" onClick={() => void openHistory(product)}>
              <History className="h-4 w-4" strokeWidth={1.5} />
            </ActionIcon>
          </>
        }
      />
    );
  }

  async function handleSaved(message: string) {
    setEditor(null);
    setNotice(message);
    try {
      await mutate();
    } catch {
      toast.error('Unable to load products from the server.');
    }
  }

  return (
    <>
    <AppShell
      active="products"
      header={
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setPage(1);
            setQuery(event.target.value);
          }}
          placeholder="Search name or item code..."
          className="w-full min-w-0 max-w-md rounded-md border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      }
    >
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-800 sm:text-3xl">Products</h1>
              <p className="mt-1 text-sm text-gray-500">
                Manage catalog items, SKUs, pricing, and stock.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
              >
                Bulk Import
              </button>
              <AddButton label="Add Product" onClick={openCreate} />
            </div>
          </div>

          <ApprovalInbox />

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

              <div className="mb-3 grid gap-2 md:grid-cols-[1fr_180px_180px]">
                <input
                  type="search"
                  value={query}
                  onChange={(event) => {
                    setPage(1);
                    setQuery(event.target.value);
                  }}
                  placeholder="Search name or item code..."
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setPage(1);
                    setStatusFilter(event.target.value);
                  }}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <select
                  value={categoryFilter}
                  onChange={(event) => {
                    setPage(1);
                    setCategoryFilter(event.target.value);
                  }}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">All categories</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div className="hidden overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm md:block">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Name</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Item Code</th>
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
                              {itemCodeOf(product)}
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
                              {productActions(product)}
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
                          <p className="mt-1 font-mono text-xs text-gray-500">Item Code {itemCodeOf(product)}</p>
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
                        {productActions(product)}
                      </div>
                    </article>
                  ))
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-100 bg-white px-4 py-3 text-sm shadow-sm">
                <p className="text-gray-600">
                  Page {page} of {pages} · {total} products
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" disabled={page <= 1} onClick={() => setPage(1)} className="rounded border border-gray-200 px-2.5 py-1.5 font-semibold disabled:opacity-40">
                    First
                  </button>
                  <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded border border-gray-200 px-2.5 py-1.5 font-semibold disabled:opacity-40">
                    Previous
                  </button>
                  <button type="button" disabled={page >= pages} onClick={() => setPage((current) => Math.min(pages, current + 1))} className="rounded border border-gray-200 px-2.5 py-1.5 font-semibold disabled:opacity-40">
                    Next
                  </button>
                  <button type="button" disabled={page >= pages} onClick={() => setPage(pages)} className="rounded border border-gray-200 px-2.5 py-1.5 font-semibold disabled:opacity-40">
                    Last
                  </button>
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const next = Number(jump);
                      if (Number.isInteger(next) && next >= 1 && next <= pages) {
                        setPage(next);
                      }
                    }}
                  >
                    <label className="text-gray-600" htmlFor="jump-page">
                      Jump to page
                    </label>
                    <input
                      id="jump-page"
                      value={jump}
                      onChange={(event) => setJump(event.target.value)}
                      inputMode="numeric"
                      className="w-16 rounded border border-gray-300 px-2 py-1.5"
                    />
                    <button type="submit" className="rounded border border-gray-200 px-2.5 py-1.5 font-semibold">
                      Go
                    </button>
                  </form>
                </div>
              </div>
            </>
          )}
    </AppShell>

      {importOpen ? (
        <BulkProductImport
          onClose={() => setImportOpen(false)}
          onImported={(message) => {
            setNotice(message);
            void mutate().catch(() => toast.error('Unable to load products from the server.'));
          }}
        />
      ) : null}

      {editor ? (
        <ProductEditor
          key={editor.product?.id ?? 'new'}
          mode={editor.mode}
          product={editor.product}
          takenSkus={new Set(products.map((product) => product.barcode))}
          onClose={() => setEditor(null)}
          onSaved={(message) => void handleSaved(message)}
        />
      ) : null}

      {barcodeProduct ? (
        <LabelPrinter product={barcodeProduct} onClose={() => setBarcodeProduct(null)} />
      ) : null}

      {historyProduct ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setHistoryProduct(null)}>
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">History</h2>
                <p className="text-sm text-gray-500">{historyProduct.name}</p>
              </div>
              <button type="button" onClick={() => setHistoryProduct(null)} className="text-sm font-semibold text-gray-500">
                Close
              </button>
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-gray-500">No recorded changes for this product yet.</p>
            ) : (
              <ol className="space-y-4 border-l border-gray-200 pl-4">
                {history.map((entry) => (
                  <li key={entry.id} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-indigo-600" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">{entry.action_type}</p>
                    <ul className="mt-1 space-y-1 text-sm text-gray-800">
                      {Object.entries(entry.changes ?? {}).map(([field, change]) => (
                        <li key={field}>
                          Changed {field.replaceAll('_', ' ')} from {String(change?.old ?? 'empty')} to {String(change?.new ?? 'empty')} on{' '}
                          {new Date(entry.created_at).toLocaleString()} by {entry.user_name || 'Unknown user'}
                        </li>
                      ))}
                    </ul>
                    {entry.reason ? <p className="mt-1 text-xs text-gray-500">Reason: {entry.reason}</p> : null}
                    <p className="mt-1 text-xs text-gray-400">{entry.method}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
