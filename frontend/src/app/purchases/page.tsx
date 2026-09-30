'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell, PageHeading } from '../../components/AppShell';
import { PosCameraScanner } from '../../components/PosCameraScanner';
import { useUsbBarcodeScanner } from '../../hooks/useUsbBarcodeScanner';
import { API_BASE, apiFetch } from '../../utils/api';

type Variant = {
  id: number;
  sku: string;
  attributes: Record<string, string>;
  stock_quantity: number;
  inherit_parent?: boolean;
  purchase_price?: number | null;
};

type LookupProduct = {
  id: number;
  name: string;
  barcode: string;
  item_code?: string | null;
  vendor?: string;
  purchase_price?: number;
  stock_quantity?: number;
  variants: Variant[];
  matched_variant_id?: number | null;
  matched_code?: string;
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

function todayInputValue() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function variantLabel(variant: Variant) {
  const parts = Object.entries(variant.attributes || {})
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`);
  return parts.length ? parts.join(' · ') : variant.sku;
}

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
  const scanRef = useRef<HTMLInputElement>(null);
  const productRef = useRef<LookupProduct | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanCode, setScanCode] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [product, setProduct] = useState<LookupProduct | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [supplierName, setSupplierName] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [date, setDate] = useState(todayInputValue());

  productRef.current = product;

  const variants = product?.variants ?? [];
  const gridRows = useMemo(() => {
    if (!product) {
      return [];
    }
    if (variants.length > 0) {
      return variants.map((variant) => ({
        key: String(variant.id),
        variantId: variant.id,
        title: variantLabel(variant),
        sku: variant.sku,
        stock: variant.stock_quantity,
      }));
    }
    return [
      {
        key: 'default',
        variantId: null as number | null,
        title: 'Default',
        sku: product.barcode,
        stock: product.stock_quantity ?? 0,
      },
    ];
  }, [product, variants]);

  async function loadPurchases() {
    const response = await apiFetch(`${API_BASE}/purchases/`);
    if (!response.ok) {
      throw new Error('Failed to load purchases');
    }
    const data: unknown = await response.json();
    setPurchases(Array.isArray(data) ? (data as Purchase[]) : []);
  }

  useEffect(() => {
    let cancelled = false;

    async function initialLoad() {
      try {
        await loadPurchases();
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

  async function lookupCode(raw: string, { increment } = { increment: true }) {
    const code = raw.trim();
    if (!code) {
      return;
    }
    setLookingUp(true);
    try {
      const params = new URLSearchParams({ code });
      const response = await apiFetch(`${API_BASE}/products/lookup?${params.toString()}`);
      if (!response.ok) {
        let message = 'No product matches that item code or barcode.';
        try {
          const payload = (await response.json()) as { detail?: unknown };
          if (typeof payload.detail === 'string' && payload.detail.trim()) {
            message = payload.detail;
          }
        } catch {
          // Keep the default lookup message if the error body is not JSON.
        }
        toast.error(message);
        return;
      }
      const found = (await response.json()) as LookupProduct;
      const current = productRef.current;
      const matchedKey =
        found.matched_variant_id != null
          ? String(found.matched_variant_id)
          : found.variants?.length
            ? null
            : 'default';

      if (current && current.id === found.id && increment && matchedKey) {
        setQuantities((qty) => {
          const next = Number(qty[matchedKey] || 0) + 1;
          return { ...qty, [matchedKey]: String(next) };
        });
        toast.success(`+1 ${code}`);
      } else {
        const initial: Record<string, string> = {};
        if (found.variants?.length) {
          for (const variant of found.variants) {
            initial[String(variant.id)] = found.matched_variant_id === variant.id ? '1' : '0';
          }
        } else {
          initial.default = '1';
        }
        setProduct(found);
        setQuantities(initial);
        setSupplierName(found.vendor || '');
        const matchedVariant = found.variants?.find((variant) => variant.id === found.matched_variant_id);
        const cost =
          matchedVariant && !matchedVariant.inherit_parent && matchedVariant.purchase_price != null
            ? matchedVariant.purchase_price
            : found.purchase_price ?? 0;
        setCostPrice(String(cost));
        toast.success(`Loaded ${found.name}`);
      }
      setScanCode('');
      scanRef.current?.focus();
    } catch {
      toast.error('Could not look up that code.');
    } finally {
      setLookingUp(false);
    }
  }

  useUsbBarcodeScanner((code) => {
    void lookupCode(code);
  }, !submitting && !cameraOpen);

  function onScanKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    void lookupCode(scanCode);
  }

  function onCameraScan(code: string) {
    setCameraOpen(false);
    void lookupCode(code);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product || submitting) {
      return;
    }
    const items = gridRows
      .map((row) => ({
        variant_id: row.variantId,
        quantity_added: Number(quantities[row.key] || 0),
      }))
      .filter((item) => Number.isFinite(item.quantity_added) && item.quantity_added > 0);
    if (!items.length) {
      toast.error('Enter quantity for at least one variant.');
      return;
    }
    const cost = Number(costPrice);
    if (!Number.isFinite(cost) || cost < 0) {
      toast.error('Cost price cannot be negative.');
      return;
    }
    if (!supplierName.trim()) {
      toast.error('Supplier name is required.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await apiFetch(`${API_BASE}/purchases/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: product.id,
          supplier_name: supplierName.trim(),
          cost_price: cost,
          date: date || null,
          items,
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
      toast.success('Stock received successfully.');
      setProduct(null);
      setQuantities({});
      setSupplierName('');
      setCostPrice('');
      setDate(todayInputValue());
      setScanCode('');
      await loadPurchases();
      scanRef.current?.focus();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not receive stock.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <AppShell active="purchases">
        <PageHeading
          title="Purchases"
          description="Scan a barcode or item code to receive stock. Repeated scans add +1 to the matching variant."
        />

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5">
          <div className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm sm:p-6 dark:border-indigo-500/20 dark:bg-slate-800">
            <label htmlFor="purchase-scan" className="mb-2 block text-sm font-semibold text-slate-800 dark:text-slate-100">
              Scan or type item code / barcode
            </label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
              <input
                ref={scanRef}
                id="purchase-scan"
                autoFocus
                inputMode="text"
                autoComplete="off"
                enterKeyHint="search"
                value={scanCode}
                onChange={(event) => setScanCode(event.target.value)}
                onKeyDown={onScanKeyDown}
                placeholder="Type a code, then press Enter"
                className="h-12 min-w-0 flex-1 rounded-xl border border-indigo-200 bg-indigo-50/40 px-4 text-base text-slate-900 outline-none transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 dark:border-indigo-500/30 dark:bg-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => setCameraOpen(true)}
                className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
              >
                <Camera className="h-4 w-4" />
                Scan with camera
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {lookingUp
                ? 'Looking up…'
                : 'Use your phone camera, a USB scanner, or type the code and press Enter.'}
            </p>
          </div>

          {product ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-700 dark:bg-slate-800">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Product name
                  </label>
                  <input
                    readOnly
                    value={product.name}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-slate-50 px-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Item code
                  </label>
                  <input
                    readOnly
                    value={product.item_code || product.barcode}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-slate-50 px-3 font-mono text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label
                    htmlFor="purchase-supplier"
                    className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200"
                  >
                    Supplier name
                  </label>
                  <input
                    id="purchase-supplier"
                    required
                    value={supplierName}
                    onChange={(event) => setSupplierName(event.target.value)}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label
                    htmlFor="purchase-cost"
                    className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200"
                  >
                    Cost price
                  </label>
                  <input
                    id="purchase-cost"
                    required
                    type="number"
                    min={0}
                    step="0.01"
                    value={costPrice}
                    onChange={(event) => setCostPrice(event.target.value)}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label
                    htmlFor="purchase-date"
                    className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200"
                  >
                    Date
                  </label>
                  <input
                    id="purchase-date"
                    required
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="mt-6">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Variants</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Type a quantity or scan that variant barcode again to add 1.
                </p>
                <div className="mt-3 overflow-x-auto rounded-xl border border-gray-100 dark:border-slate-700">
                  <div className="min-w-[18rem]">
                    <div className="grid grid-cols-[1fr_auto_6.5rem] gap-3 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-4 dark:bg-slate-900">
                      <span>Variant</span>
                      <span>Stock</span>
                      <span>Qty</span>
                    </div>
                    <ul>
                      {gridRows.map((row) => (
                        <li
                          key={row.key}
                          className="grid grid-cols-[1fr_auto_6.5rem] items-center gap-3 border-t border-gray-100 px-3 py-3 sm:px-4 dark:border-slate-700"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                              {row.title}
                            </p>
                            <p className="truncate font-mono text-xs text-slate-400">{row.sku}</p>
                          </div>
                          <span className="text-sm text-slate-500">{row.stock}</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            value={quantities[row.key] ?? '0'}
                            onChange={(event) =>
                              setQuantities((current) => ({ ...current, [row.key]: event.target.value }))
                            }
                            className="h-10 w-full rounded-lg border border-gray-200 px-2 text-right text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="mt-6 h-12 w-full rounded-xl bg-indigo-600 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {submitting ? 'Saving...' : 'Receive stock'}
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-12 text-center text-sm text-slate-500 sm:px-6 sm:py-16 dark:border-slate-700 dark:bg-slate-800">
              Scan with the camera or type an item code to load the product and its variants.
            </div>
          )}
        </form>

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">Recent receipts</h2>
          {loading ? (
            <div className="flex items-center justify-center rounded-lg border border-gray-100 bg-white p-16 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                <p className="text-sm font-medium text-gray-500">Loading data...</p>
              </div>
            </div>
          ) : (
            <>
              {error ? (
                <div className="mb-6 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="hidden overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm md:block dark:border-slate-700 dark:bg-slate-800">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                    <thead className="bg-gray-50 dark:bg-slate-900">
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
                          Qty added
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500"
                        >
                          Cost price
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
                        >
                          Created by
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white dark:divide-slate-700 dark:bg-slate-800">
                      {purchases.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500">
                            No stock entries yet. Scan a product to get started.
                          </td>
                        </tr>
                      ) : (
                        purchases.map((purchase) => (
                          <tr key={purchase.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/40">
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700 dark:text-slate-200">
                              {formatPurchaseDate(purchase.date)}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900 dark:text-slate-100">
                              {purchase.product_name || `Product #${purchase.product_id}`}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700 dark:text-slate-200">
                              {purchase.supplier_name}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-semibold text-gray-900 dark:text-slate-100">
                              +{purchase.quantity_added}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-900 dark:text-slate-100">
                              {formatCurrency(purchase.cost_price)}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600 dark:text-slate-300">
                              {purchase.created_by}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="grid gap-3 md:hidden">
                {purchases.length === 0 ? (
                  <div className="rounded-lg border border-gray-100 bg-white px-4 py-12 text-center text-sm text-gray-500 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    No stock entries yet. Scan a product to get started.
                  </div>
                ) : (
                  purchases.map((purchase) => (
                    <article
                      key={purchase.id}
                      className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-semibold text-gray-900 dark:text-slate-100">
                            {purchase.product_name || `Product #${purchase.product_id}`}
                          </h3>
                          <p className="mt-1 text-xs text-gray-500">{purchase.supplier_name}</p>
                        </div>
                        <p className="shrink-0 text-sm font-semibold text-gray-900 dark:text-slate-100">
                          +{purchase.quantity_added}
                        </p>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-sm">
                        <p className="text-gray-500">{formatPurchaseDate(purchase.date)}</p>
                        <p className="font-semibold text-gray-900 dark:text-slate-100">
                          {formatCurrency(purchase.cost_price)}
                        </p>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </>
          )}
        </section>
      </AppShell>

      {cameraOpen ? (
        <PosCameraScanner
          regionId="purchase-camera-reader"
          onScan={onCameraScan}
          onClose={() => setCameraOpen(false)}
        />
      ) : null}
    </>
  );
}
