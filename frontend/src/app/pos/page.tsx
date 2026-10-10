'use client';

import { useMemo, useState } from 'react';
import { Minus, Plus, Search, Trash2 } from 'lucide-react';
import { AppShell } from '../../components/AppShell';

type CatalogItem = {
  id: string;
  name: string;
  variant: string;
  barcode: string;
  price: number;
};

type CartLine = {
  id: string;
  name: string;
  variant: string;
  price: number;
  qty: number;
};

type Customer = {
  id: string;
  name: string;
  phone: string;
};

const VAT_RATE = 0.05;

const CATALOG: CatalogItem[] = [
  { id: 'sku-1001', name: 'Oxford Shirt', variant: 'White / M', barcode: '10000001', price: 1850 },
  { id: 'sku-1002', name: 'Oxford Shirt', variant: 'Navy / L', barcode: '10000002', price: 1850 },
  { id: 'sku-1003', name: 'Slim Chino', variant: 'Khaki / 32', barcode: '10000003', price: 2450 },
  { id: 'sku-1004', name: 'Slim Chino', variant: 'Black / 34', barcode: '10000004', price: 2450 },
  { id: 'sku-1005', name: 'Leather Belt', variant: 'Brown', barcode: '10000005', price: 980 },
  { id: 'sku-1006', name: 'Canvas Sneaker', variant: 'White / 42', barcode: '10000006', price: 3200 },
  { id: 'sku-1007', name: 'Merino Polo', variant: 'Forest / M', barcode: '10000007', price: 2100 },
  { id: 'sku-1008', name: 'Linen Trouser', variant: 'Sand / 32', barcode: '01-PP9800', price: 2750 },
];

const CUSTOMERS: Customer[] = [
  { id: 'walk-in', name: 'Walk-in', phone: '' },
  { id: 'c-1', name: 'Nadia Rahman', phone: '01711000001' },
  { id: 'c-2', name: 'Imran Hossain', phone: '01822000002' },
  { id: 'c-3', name: 'Farhana Akter', phone: '01933000003' },
];

function money(amount: number) {
  return `৳ ${amount.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PosPage() {
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState('walk-in');
  const [customerName, setCustomerName] = useState('Walk-in');
  const [customerPhone, setCustomerPhone] = useState('');
  const [discount, setDiscount] = useState('0');
  const [notice, setNotice] = useState<string | null>(null);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return [];
    }
    return CATALOG.filter(
      (item) =>
        item.barcode.toLowerCase() === term ||
        item.name.toLowerCase().includes(term) ||
        item.variant.toLowerCase().includes(term) ||
        item.barcode.includes(term),
    ).slice(0, 6);
  }, [query]);

  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + line.price * line.qty, 0), [cart]);
  const discountAmount = useMemo(() => {
    const parsed = Number(discount);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }
    return Math.min(parsed, subtotal);
  }, [discount, subtotal]);
  const taxable = Math.max(0, subtotal - discountAmount);
  const vat = taxable * VAT_RATE;
  const grandTotal = taxable + vat;

  function addItem(item: CatalogItem) {
    setCart((current) => {
      const existing = current.find((line) => line.id === item.id);
      if (existing) {
        return current.map((line) => (line.id === item.id ? { ...line, qty: line.qty + 1 } : line));
      }
      return [...current, { id: item.id, name: item.name, variant: item.variant, price: item.price, qty: 1 }];
    });
    setQuery('');
    setNotice(null);
  }

  function commitScan() {
    const term = query.trim().toLowerCase();
    if (!term) {
      return;
    }
    const exact = CATALOG.find((item) => item.barcode.toLowerCase() === term || item.id === term);
    const hit = exact ?? (matches.length === 1 ? matches[0] : undefined);
    if (!hit) {
      setNotice(matches.length > 1 ? 'Choose a product from the matches below.' : 'No sample product matches that code.');
      return;
    }
    addItem(hit);
  }

  function setQty(id: string, next: number) {
    setCart((current) =>
      next < 1 ? current.filter((line) => line.id !== id) : current.map((line) => (line.id === id ? { ...line, qty: next } : line)),
    );
  }

  function selectCustomer(id: string) {
    const customer = CUSTOMERS.find((row) => row.id === id) ?? CUSTOMERS[0];
    setCustomerId(customer.id);
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone);
  }

  function checkout() {
    if (cart.length === 0) {
      setNotice('Add at least one item before checkout.');
      return;
    }
    setNotice(`Sale held for ${customerName || 'Walk-in'} · ${money(grandTotal)}. Backend checkout comes next.`);
    setCart([]);
    setDiscount('0');
    setQuery('');
  }

  return (
    <AppShell
      active="pos"
      header={<p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">Point of Sale</p>}
      mainClassName="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50 dark:bg-slate-900"
    >
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-slate-200 lg:w-[70%] lg:flex-none lg:border-b-0 lg:border-r dark:border-slate-700">
          <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6 dark:border-slate-700 dark:bg-slate-800">
            <label htmlFor="pos-scan" className="mb-2 block text-sm font-semibold text-slate-800 dark:text-slate-100">
              Scan Barcode or Search Product
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="pos-scan"
                autoFocus
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setNotice(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitScan();
                  }
                }}
                placeholder="Scan a barcode or type a name, variant, or item code"
                className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-base text-slate-900 outline-none ring-indigo-500/30 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:bg-slate-900"
              />
            </div>
            {matches.length > 0 ? (
              <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">
                {matches.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => addItem(item)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    >
                      <span>
                        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{item.name}</span>
                        <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                          {item.variant} · {item.barcode}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-slate-800 dark:text-slate-100">{money(item.price)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {notice ? <p className="mt-3 text-sm font-medium text-indigo-700 dark:text-indigo-300">{notice}</p> : null}
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800/80 dark:text-slate-200">
                  <tr>
                    <th className="px-4 py-3">Item Name</th>
                    <th className="px-4 py-3">Variant</th>
                    <th className="px-4 py-3 text-right">Price</th>
                    <th className="px-4 py-3 text-center">QTY</th>
                    <th className="px-4 py-3 text-right">Subtotal</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-16 text-center text-sm text-slate-500 dark:text-slate-400">
                        Cart is empty. Scan a barcode or pick a sample product.
                      </td>
                    </tr>
                  ) : (
                    cart.map((line) => (
                      <tr key={line.id} className="border-t border-slate-100 dark:border-slate-700">
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{line.name}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{line.variant}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200">{money(line.price)}</td>
                        <td className="px-4 py-3">
                          <div className="mx-auto flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-900">
                            <button
                              type="button"
                              aria-label={`Decrease ${line.name}`}
                              onClick={() => setQty(line.id, line.qty - 1)}
                              className="inline-flex h-9 w-9 items-center justify-center text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <span className="w-8 text-center text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">{line.qty}</span>
                            <button
                              type="button"
                              aria-label={`Increase ${line.name}`}
                              onClick={() => setQty(line.id, line.qty + 1)}
                              className="inline-flex h-9 w-9 items-center justify-center text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          {money(line.price * line.qty)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            aria-label={`Remove ${line.name}`}
                            onClick={() => setCart((current) => current.filter((row) => row.id !== line.id))}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <aside className="flex w-full shrink-0 flex-col bg-white lg:w-[30%] dark:bg-slate-800">
          <div className="flex-1 space-y-6 overflow-auto p-5 sm:p-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Order Summary</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{cart.reduce((sum, line) => sum + line.qty, 0)} items in this sale</p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Customer</h3>
              <label htmlFor="pos-customer" className="mt-3 mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Select customer
              </label>
              <select
                id="pos-customer"
                value={customerId}
                onChange={(event) => selectCustomer(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              >
                {CUSTOMERS.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                    {customer.phone ? ` · ${customer.phone}` : ''}
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>
              <label htmlFor="pos-customer-name" className="mt-3 mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Name
              </label>
              <input
                id="pos-customer-name"
                value={customerName}
                onChange={(event) => {
                  setCustomerId('custom');
                  setCustomerName(event.target.value);
                }}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
              <label htmlFor="pos-customer-phone" className="mt-3 mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Phone
              </label>
              <input
                id="pos-customer-phone"
                value={customerPhone}
                onChange={(event) => {
                  setCustomerId('custom');
                  setCustomerPhone(event.target.value);
                }}
                placeholder="01XXXXXXXXX"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                <dt>Subtotal</dt>
                <dd className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{money(subtotal)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 text-slate-600 dark:text-slate-300">
                <dt>
                  <label htmlFor="pos-discount">Discount</label>
                </dt>
                <dd>
                  <input
                    id="pos-discount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={discount}
                    onChange={(event) => setDiscount(event.target.value)}
                    className="h-10 w-28 rounded-xl border border-slate-200 bg-slate-50 px-3 text-right text-sm font-semibold tabular-nums text-slate-900 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  />
                </dd>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                <dt>VAT / Tax (5%)</dt>
                <dd className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{money(vat)}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-base dark:border-slate-700">
                <dt className="font-semibold text-slate-900 dark:text-slate-100">Grand Total</dt>
                <dd className="text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{money(grandTotal)}</dd>
              </div>
            </dl>
          </div>

          <div className="border-t border-slate-200 p-5 sm:p-6 dark:border-slate-700">
            <button
              type="button"
              onClick={checkout}
              className="h-16 w-full rounded-2xl bg-indigo-600 text-lg font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500"
            >
              Checkout / Pay
            </button>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
