'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { PosCameraScanner } from '../../components/PosCameraScanner';
import {
  ThermalReceipt,
  VAT_RATE,
  formatPrice,
  type Receipt,
} from '../../components/ThermalReceipt';
import { AppShell } from '../../components/AppShell';
import { API_BASE, apiFetch } from '../../utils/api';
import { useApi } from '../../utils/query';
import { printWithMode } from '../../utils/print';

type PosVariant = {
  id: number;
  sku: string;
  attributes?: Record<string, string>;
  stock_quantity: number;
  effective_price: number;
  effective_sale_vat?: number;
};

type Product = {
  id: number;
  name: string;
  barcode: string;
  additional_barcodes?: string[];
  price: number;
  stock_quantity: number;
  is_active: boolean;
  is_hidden?: boolean;
  sale_vat?: number;
  variants?: PosVariant[];
};

type Sellable = {
  cartKey: string;
  productId: number;
  variantId?: number;
  name: string;
  price: number;
  stock_quantity: number;
  vatRate?: number;
};

function parentSellable(product: Product): Sellable {
  return {
    cartKey: `p-${product.id}`,
    productId: product.id,
    name: product.name,
    price: product.price,
    stock_quantity: product.stock_quantity,
    vatRate: product.sale_vat,
  };
}

function variantSellable(product: Product, variant: PosVariant): Sellable {
  const label = Object.values(variant.attributes ?? {}).filter(Boolean).join(' / ');
  return {
    cartKey: `v-${variant.id}`,
    productId: product.id,
    variantId: variant.id,
    name: label ? `${product.name} (${label})` : `${product.name} (${variant.sku})`,
    price: variant.effective_price,
    stock_quantity: variant.stock_quantity,
    vatRate: variant.effective_sale_vat,
  };
}

function productMatchesBarcode(product: Product, term: string) {
  if (product.barcode.toLowerCase() === term) {
    return true;
  }
  return (product.additional_barcodes ?? []).some((code) => code.toLowerCase() === term);
}

function findSellable(products: Product[], term: string): Sellable | undefined {
  for (const product of products) {
    const variant = (product.variants ?? []).find((item) => item.sku.toLowerCase() === term);
    if (variant) {
      return variantSellable(product, variant);
    }
    if (productMatchesBarcode(product, term)) {
      return parentSellable(product);
    }
  }
  return undefined;
}

function productMatchesQuery(product: Product, term: string) {
  return (
    product.name.toLowerCase().includes(term) ||
    product.barcode.toLowerCase().includes(term) ||
    (product.additional_barcodes ?? []).some((code) => code.toLowerCase().includes(term)) ||
    (product.variants ?? []).some(
      (variant) =>
        variant.sku.toLowerCase().includes(term) ||
        Object.values(variant.attributes ?? {}).some((value) => value.toLowerCase().includes(term)),
    )
  );
}

type CartItem = Sellable & {
  quantity: number;
};

export default function PosPage() {
  const { data, error: loadError, isLoading, mutate } = useApi<Product[]>(`${API_BASE}/products/`);
  const products = (data ?? []).filter((product) => product.is_active && !product.is_hidden);
  const loading = isLoading && !data;
  const error = loadError ? 'Unable to load products from the server.' : null;
  const [cart, setCart] = useState<CartItem[]>([]);
  const [query, setQuery] = useState('');
  const [checkingOut, setCheckingOut] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [customerPhone, setCustomerPhone] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const productsRef = useRef(products);
  productsRef.current = products;

  const filteredProducts = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return products;
    }
    return products.filter((product) => productMatchesQuery(product, term));
  }, [products, query]);

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart],
  );
  const vat = subtotal * VAT_RATE;
  const grandTotal = subtotal + vat;

  const addToCart = useCallback((sellable: Sellable) => {
    if (sellable.stock_quantity <= 0) {
      setNotice('Out of Stock!');
      return;
    }

    const existing = cart.find((item) => item.cartKey === sellable.cartKey);
    if (existing && existing.quantity >= existing.stock_quantity) {
      setNotice('Out of Stock!');
      return;
    }

    setNotice(null);
    setCart((current) => {
      const inCart = current.find((item) => item.cartKey === sellable.cartKey);
      if (!inCart) {
        return [...current, { ...sellable, quantity: 1 }];
      }
      if (inCart.quantity >= inCart.stock_quantity) {
        return current;
      }
      return current.map((item) =>
        item.cartKey === sellable.cartKey ? { ...item, quantity: item.quantity + 1 } : item,
      );
    });
  }, [cart]);

  const addByBarcode = useCallback(
    (code: string) => {
      const term = code.trim().toLowerCase();
      if (!term) {
        return;
      }
      const match = findSellable(productsRef.current, term);
      if (!match) {
        setNotice(`No product matches barcode ${code.trim()}.`);
        return;
      }
      addToCart(match);
      setQuery('');
      setCameraOpen(false);
    },
    [addToCart],
  );

  useEffect(() => {
    let buffer = '';
    let lastTime = 0;

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;
      const now = performance.now();
      const gap = now - lastTime;
      lastTime = now;

      if (event.key === 'Enter') {
        const code = buffer.trim();
        buffer = '';
        if (!typing && code.length >= 3) {
          event.preventDefault();
          addByBarcode(code);
        }
        return;
      }

      if (event.key.length !== 1) {
        return;
      }
      if (typing || gap > 40) {
        buffer = '';
      }
      if (!typing) {
        buffer += event.key;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [addByBarcode]);

  function changeQuantity(cartKey: string, delta: number) {
    const target = cart.find((item) => item.cartKey === cartKey);
    if (target && delta > 0 && target.quantity >= target.stock_quantity) {
      setNotice('Out of Stock!');
      return;
    }

    setNotice(null);
    setCart((current) =>
      current.flatMap((item) => {
        if (item.cartKey !== cartKey) {
          return [item];
        }
        const nextQty = item.quantity + delta;
        if (nextQty <= 0) {
          return [];
        }
        if (nextQty > item.stock_quantity) {
          return [item];
        }
        return [{ ...item, quantity: nextQty }];
      }),
    );
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    const term = query.trim().toLowerCase();
    if (!term) {
      return;
    }

    const exactBarcode = findSellable(products, term);
    const match = exactBarcode ?? (filteredProducts.length === 1 ? parentSellable(filteredProducts[0]) : undefined);

    if (!match) {
      return;
    }

    addToCart(match);
    setQuery('');
  }

  async function checkout() {
    if (cart.length === 0 || checkingOut) {
      return;
    }

    setCheckingOut(true);
    setNotice(null);

    const phone = customerPhone.trim();

    try {
      const response = await apiFetch(`${API_BASE}/orders/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: 1,
          branch_id: 1,
          customer_phone: phone || null,
          items: cart.map((item) => ({
            product_id: item.productId,
            variant_id: item.variantId ?? null,
            quantity: item.quantity,
            price: item.price,
          })),
        }),
      });

      if (!response.ok) {
        let message = 'Could not place the order.';
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

      const order = (await response.json()) as { id?: number; created_at?: string };
      setReceipt({
        orderId: typeof order.id === 'number' ? order.id : 0,
        createdAt: typeof order.created_at === 'string' ? order.created_at : new Date().toISOString(),
        items: cart.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
        })),
        subtotal,
        vat,
        grandTotal,
        customerPhone: phone || null,
      });
      setCart([]);
      setCustomerPhone('');
      setCartOpen(false);
      await mutate();
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'Could not place the order.';
      setNotice(message);
    } finally {
      setCheckingOut(false);
    }
  }

  function startNewOrder() {
    setReceipt(null);
    setCart([]);
    setCustomerPhone('');
    setNotice(null);
  }

  const units = cart.reduce((sum, item) => sum + item.quantity, 0);

  const cartPanel = (
    <>
      <div className="border-b border-gray-100 px-5 py-4">
        <h2 className="text-lg font-semibold text-gray-900">Current Order</h2>
        <p className="text-xs text-gray-500">
          {cart.length === 1 ? '1 item in cart' : `${cart.length} items in cart`}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
        {cart.length === 0 ? (
          <div className="flex h-full min-h-24 items-center justify-center text-center text-sm text-gray-400">
            Tap a product to start billing.
          </div>
        ) : (
          <ul className="space-y-3">
            {cart.map((item) => (
              <li key={item.cartKey} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900">{item.name}</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {formatPrice(item.price * item.quantity)}
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">{formatPrice(item.price)} each</p>
                <div className="mt-3 flex items-center justify-between">
                  <div className="inline-flex items-center rounded-md border border-gray-200 bg-white">
                    <button
                      type="button"
                      onClick={() => changeQuantity(item.cartKey, -1)}
                      className="px-2.5 py-1 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                      aria-label={`Decrease ${item.name}`}
                    >
                      −
                    </button>
                    <span className="min-w-8 px-2 text-center text-sm font-semibold text-gray-900">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => changeQuantity(item.cartKey, 1)}
                      disabled={item.quantity >= item.stock_quantity}
                      className="px-2.5 py-1 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300"
                      aria-label={`Increase ${item.name}`}
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => changeQuantity(item.cartKey, -item.quantity)}
                    className="text-xs font-medium text-red-500 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-gray-200 px-5 py-4">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>VAT (5%)</span>
            <span>{formatPrice(vat)}</span>
          </div>
          <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-bold text-gray-900">
            <span>Grand Total</span>
            <span>{formatPrice(grandTotal)}</span>
          </div>
        </div>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs font-medium text-gray-600">
            Customer Phone (Optional)
          </span>
          <input
            type="tel"
            value={customerPhone}
            onChange={(event) => setCustomerPhone(event.target.value)}
            placeholder="01XXXXXXXXX"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
        </label>
        <button
          type="button"
          onClick={() => void checkout()}
          disabled={cart.length === 0 || checkingOut}
          className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {checkingOut ? 'Processing...' : 'Checkout / Pay Now'}
        </button>
      </div>
    </>
  );

  return (
    <>
    <AppShell
      active="pos"
      className="print:hidden"
      header={<p className="truncate text-sm font-semibold text-gray-800">Point of Sale</p>}
      mainClassName="flex min-h-0 flex-1 flex-col overflow-hidden bg-gray-50 md:flex-row"
    >
          <section className="flex min-h-0 min-w-0 flex-1 flex-col p-4 md:p-6">
            <div className="mb-4">
              <h1 className="text-2xl font-semibold text-gray-800 sm:text-3xl">Point of Sale</h1>
              <p className="mt-1 text-sm text-gray-500">Scan a barcode or tap a product to build the order.</p>
            </div>

            <form
              onSubmit={(event) => event.preventDefault()}
              className="mb-4 flex flex-row items-stretch gap-2"
            >
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search by barcode or product name..."
                className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => setCameraOpen(true)}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md ring-2 ring-indigo-200 hover:bg-indigo-500"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                  <circle cx="12" cy="13" r="3.5" />
                </svg>
                Scan with Camera
              </button>
            </form>

            {notice ? (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700" role="alert">
                {notice}
              </div>
            ) : null}

            {loading ? (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-gray-100 bg-white shadow-sm">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                  <p className="text-sm font-medium text-gray-500">Loading data...</p>
                </div>
              </div>
            ) : error ? (
              <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto pb-24 pr-1 md:pb-1">
                {filteredProducts.length === 0 ? (
                  <div className="rounded-lg border border-gray-100 bg-white px-6 py-12 text-center text-sm text-gray-500 shadow-sm">
                    No matching products.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
                    {filteredProducts.map((product) => {
                      const outOfStock = product.stock_quantity <= 0;
                      return (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => addToCart(parentSellable(product))}
                          className={`rounded-xl border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:border-indigo-200 hover:shadow-md ${
                            outOfStock ? 'opacity-50' : ''
                          }`}
                        >
                          <p className="truncate text-sm font-semibold text-gray-900">{product.name}</p>
                          <p className="mt-1 font-mono text-xs text-gray-400">{product.barcode}</p>
                          <div className="mt-4 flex items-end justify-between">
                            <span className="text-xs font-medium text-gray-500">
                              Stock {product.stock_quantity}
                            </span>
                            <span className="text-base font-bold text-indigo-600">
                              {formatPrice(product.price)}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>

          <aside className="hidden h-full w-80 shrink-0 border-l border-gray-200 bg-white md:flex md:flex-col lg:w-96">
            {cartPanel}
          </aside>

      <button
        type="button"
        onClick={() => setCartOpen(true)}
        className="fixed bottom-5 right-5 z-20 inline-flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg md:hidden"
      >
        Cart
        <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{units}</span>
      </button>

      {cartOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close cart"
            className="absolute inset-0 bg-black/40"
            onClick={() => setCartOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-2xl bg-white shadow-2xl">
            <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-gray-300" />
            {cartPanel}
          </div>
        </div>
      ) : null}
    </AppShell>

    {cameraOpen ? (
      <PosCameraScanner onScan={addByBarcode} onClose={() => setCameraOpen(false)} />
    ) : null}

    {receipt ? (
      <>
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="receipt-title"
        >
          <div className="flex max-h-[90vh] flex-col items-center overflow-y-auto rounded-xl bg-neutral-100 p-5 shadow-2xl">
            <h2 id="receipt-title" className="mb-3 text-sm font-semibold text-gray-800">
              Sale complete
            </h2>
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
                onClick={startNewOrder}
                className="flex-1 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                New Order
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
    </>
  );
}
