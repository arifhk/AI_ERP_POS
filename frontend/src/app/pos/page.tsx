'use client';

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import {
  ThermalReceipt,
  VAT_RATE,
  formatPrice,
  type Receipt,
} from '../../components/ThermalReceipt';

const API_BASE = 'http://localhost:8000';

type Product = {
  id: number;
  name: string;
  barcode: string;
  price: number;
  stock_quantity: number;
  is_active: boolean;
};

type CartItem = {
  id: number;
  name: string;
  price: number;
  quantity: number;
  stock_quantity: number;
};

export default function PosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  async function loadProducts() {
    const response = await fetch(`${API_BASE}/products/`);
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
        await loadProducts();
        if (cancelled) {
          return;
        }
        setError(null);
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

  const filteredProducts = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return products;
    }
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(term) ||
        product.barcode.toLowerCase().includes(term),
    );
  }, [products, query]);

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart],
  );
  const vat = subtotal * VAT_RATE;
  const grandTotal = subtotal + vat;

  function addToCart(product: Product) {
    if (product.stock_quantity <= 0) {
      return;
    }

    setNotice(null);
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (!existing) {
        return [
          ...current,
          {
            id: product.id,
            name: product.name,
            price: product.price,
            quantity: 1,
            stock_quantity: product.stock_quantity,
          },
        ];
      }
      if (existing.quantity >= existing.stock_quantity) {
        return current;
      }
      return current.map((item) =>
        item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
      );
    });
  }

  function changeQuantity(productId: number, delta: number) {
    setNotice(null);
    setCart((current) =>
      current.flatMap((item) => {
        if (item.id !== productId) {
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

    const exactBarcode = products.find(
      (product) => product.barcode.toLowerCase() === term,
    );
    const match =
      exactBarcode ?? (filteredProducts.length === 1 ? filteredProducts[0] : undefined);

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

    try {
      const response = await fetch(`${API_BASE}/orders/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: 1,
          branch_id: 1,
          items: cart.map((item) => ({
            product_id: item.id,
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
      });
      setCart([]);
      await loadProducts();
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
    setNotice(null);
  }

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
          <Link href="/pos" className="block py-2.5 px-4 rounded transition duration-200 bg-gray-800 hover:bg-gray-700">POS</Link>
          <Link href="/orders" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700">Orders</Link>
          <Link href="/settings" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700">Settings</Link>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white p-4">
          <div className="flex items-center">
            <input
              type="text"
              placeholder="Search..."
              className="w-64 rounded-md border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-center space-x-4">
            <button className="text-xl text-gray-500 hover:text-gray-700">🔔</button>
            <div className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-indigo-600 font-bold text-white">
              AH
            </div>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 overflow-hidden bg-gray-50">
          <section className="flex w-[70%] min-w-0 flex-col p-6">
            <div className="mb-4">
              <h1 className="text-3xl font-semibold text-gray-800">Point of Sale</h1>
              <p className="mt-1 text-sm text-gray-500">Scan a barcode or tap a product to build the order.</p>
            </div>

            <form
              onSubmit={(event) => event.preventDefault()}
              className="mb-4"
            >
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search by barcode or product name..."
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </form>

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
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {filteredProducts.length === 0 ? (
                  <div className="rounded-lg border border-gray-100 bg-white px-6 py-12 text-center text-sm text-gray-500 shadow-sm">
                    No matching products.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-4">
                    {filteredProducts.map((product) => {
                      const outOfStock = product.stock_quantity <= 0;
                      return (
                        <button
                          key={product.id}
                          type="button"
                          disabled={outOfStock}
                          onClick={() => addToCart(product)}
                          className="rounded-xl border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:border-indigo-200 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
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

          <aside className="flex w-[30%] min-w-[320px] flex-col border-l border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Current Order</h2>
              <p className="text-xs text-gray-500">{cart.length === 1 ? '1 item in cart' : `${cart.length} items in cart`}</p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              {cart.length === 0 ? (
                <div className="flex h-full items-center justify-center text-center text-sm text-gray-400">
                  Tap a product to start billing.
                </div>
              ) : (
                <ul className="space-y-3">
                  {cart.map((item) => (
                    <li key={item.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
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
                            onClick={() => changeQuantity(item.id, -1)}
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
                            onClick={() => changeQuantity(item.id, 1)}
                            className="px-2.5 py-1 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                            aria-label={`Increase ${item.name}`}
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => changeQuantity(item.id, -item.quantity)}
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
              {notice && (
                <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {notice}
                </p>
              )}
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
              <button
                type="button"
                onClick={() => void checkout()}
                disabled={cart.length === 0 || checkingOut}
                className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {checkingOut ? 'Processing...' : 'Checkout / Pay Now'}
              </button>
            </div>
          </aside>
        </main>
      </div>
    </div>

    {receipt && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:static print:bg-transparent print:p-0"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-title"
      >
        <div className="flex flex-col items-center">
          <p id="receipt-title" className="sr-only">
            Order receipt
          </p>
          <ThermalReceipt receipt={receipt} />
          <div className="mt-4 flex w-full max-w-xs gap-2 print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
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
    )}
    </>
  );
}
