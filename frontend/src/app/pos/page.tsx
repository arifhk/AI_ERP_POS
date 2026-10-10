'use client';

import { useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';

type Category = 'T-Shirts' | 'Pants';

type Product = {
  id: string;
  name: string;
  price: number;
  category: Category;
  color: string;
};

type CartLine = {
  id: string;
  name: string;
  price: number;
  qty: number;
  discount: number;
};

type NumpadMode = 'qty' | 'disc' | 'price';

type Customer = {
  id: string;
  name: string;
};

const PRODUCTS: Product[] = [
  { id: 'tee-oxford', name: 'Oxford Shirt', price: 1850, category: 'T-Shirts', color: '#714B67' },
  { id: 'tee-navy', name: 'Navy Oxford', price: 1850, category: 'T-Shirts', color: '#1f4e79' },
  { id: 'tee-polo', name: 'Merino Polo', price: 2100, category: 'T-Shirts', color: '#017e84' },
  { id: 'tee-linen', name: 'Linen Tee', price: 1450, category: 'T-Shirts', color: '#c4a574' },
  { id: 'tee-stripe', name: 'Stripe Tee', price: 1250, category: 'T-Shirts', color: '#875A7B' },
  { id: 'tee-crew', name: 'Crew Neck', price: 980, category: 'T-Shirts', color: '#4c6a92' },
  { id: 'pant-chino', name: 'Slim Chino', price: 2450, category: 'Pants', color: '#8d6e4c' },
  { id: 'pant-black', name: 'Black Chino', price: 2450, category: 'Pants', color: '#2c3e50' },
  { id: 'pant-linen', name: 'Linen Trouser', price: 2750, category: 'Pants', color: '#b08968' },
  { id: 'pant-denim', name: 'Straight Denim', price: 3200, category: 'Pants', color: '#3d5a80' },
  { id: 'pant-cargo', name: 'Cargo Pant', price: 2950, category: 'Pants', color: '#6b705c' },
  { id: 'pant-pleat', name: 'Pleated Trouser', price: 3100, category: 'Pants', color: '#5c4d7a' },
];

const CUSTOMERS: Customer[] = [
  { id: 'walk-in', name: 'Customer' },
  { id: 'c-1', name: 'Nadia Rahman' },
  { id: 'c-2', name: 'Imran Hossain' },
  { id: 'c-3', name: 'Farhana Akter' },
];

const CATEGORIES = ['Home', 'T-Shirts', 'Pants'] as const;

function money(amount: number) {
  const [whole, fraction] = Math.abs(amount).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${amount < 0 ? '-' : ''}${grouped}.${fraction}`;
}

function lineTotal(line: CartLine) {
  return line.price * line.qty * (1 - line.discount / 100);
}

export default function PosPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('Home');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<NumpadMode>('qty');
  const [buffer, setBuffer] = useState('');
  const [bufferFresh, setBufferFresh] = useState(true);
  const [customerIndex, setCustomerIndex] = useState(0);
  const [paidNote, setPaidNote] = useState<string | null>(null);

  const visibleProducts = useMemo(() => {
    const term = query.trim().toLowerCase();
    return PRODUCTS.filter((product) => {
      const inCategory = category === 'Home' || product.category === category;
      const matches = !term || product.name.toLowerCase().includes(term);
      return inCategory && matches;
    });
  }, [category, query]);

  const grandTotal = useMemo(() => cart.reduce((sum, line) => sum + lineTotal(line), 0), [cart]);
  const customer = CUSTOMERS[customerIndex] ?? CUSTOMERS[0];

  function selectLine(id: string) {
    setSelectedId(id);
    setBuffer('');
    setBufferFresh(true);
  }

  function addProduct(product: Product) {
    setPaidNote(null);
    setCart((current) => {
      const existing = current.find((line) => line.id === product.id);
      if (existing) {
        return current.map((line) => (line.id === product.id ? { ...line, qty: line.qty + 1 } : line));
      }
      return [...current, { id: product.id, name: product.name, price: product.price, qty: 1, discount: 0 }];
    });
    selectLine(product.id);
  }

  function updateSelected(nextBuffer: string) {
    if (!selectedId) {
      return;
    }
    setCart((current) => {
      const line = current.find((row) => row.id === selectedId);
      if (!line) {
        return current;
      }
      if (nextBuffer === '' || nextBuffer === '.' || nextBuffer === '-') {
        return current;
      }
      const value = Number(nextBuffer);
      if (!Number.isFinite(value)) {
        return current;
      }
      if (mode === 'qty') {
        const qty = Math.trunc(Math.abs(value));
        if (qty < 1) {
          setSelectedId(null);
          return current.filter((row) => row.id !== line.id);
        }
        return current.map((row) => (row.id === line.id ? { ...row, qty } : row));
      }
      if (mode === 'disc') {
        const discount = Math.min(100, Math.max(0, value));
        return current.map((row) => (row.id === line.id ? { ...row, discount } : row));
      }
      const price = Math.max(0, Math.abs(value));
      return current.map((row) => (row.id === line.id ? { ...row, price } : row));
    });
  }

  function pressDigit(digit: string) {
    if (!selectedId) {
      return;
    }
    const next = bufferFresh ? digit : `${buffer}${digit}`;
    setBuffer(next);
    setBufferFresh(false);
    updateSelected(next);
  }

  function pressDot() {
    if (!selectedId || mode === 'qty') {
      return;
    }
    if (bufferFresh) {
      setBuffer('0.');
      setBufferFresh(false);
      return;
    }
    if (buffer.includes('.')) {
      return;
    }
    const next = `${buffer || '0'}.`;
    setBuffer(next);
    setBufferFresh(false);
  }

  function pressBackspace() {
    if (!selectedId) {
      return;
    }
    const next = bufferFresh ? '' : buffer.slice(0, -1);
    setBuffer(next);
    setBufferFresh(false);
    if (next === '') {
      if (mode === 'qty') {
        setCart((current) => current.filter((row) => row.id !== selectedId));
        setSelectedId(null);
      }
      return;
    }
    updateSelected(next);
  }

  function switchMode(nextMode: NumpadMode) {
    setMode(nextMode);
    setBuffer('');
    setBufferFresh(true);
  }

  function pay() {
    if (cart.length === 0) {
      return;
    }
    const label = customer.name === 'Customer' ? 'Walk-in' : customer.name;
    setPaidNote(`Payment ${money(grandTotal)} · ${label}`);
    setCart([]);
    setSelectedId(null);
    setBuffer('');
    setBufferFresh(true);
  }

  const modeButton = (key: NumpadMode, label: string) => (
    <button
      type="button"
      onClick={() => switchMode(key)}
      className={`h-14 rounded-md text-base font-semibold shadow-sm transition active:scale-[0.98] sm:h-16 ${
        mode === key ? 'bg-[#714B67] text-white' : 'bg-white text-[#714B67] hover:bg-[#f7f2f5]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <AppShell
      active="pos"
      mainClassName="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#ececec] p-0 dark:bg-slate-900"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <section className="flex min-h-0 w-full flex-[2] flex-col overflow-hidden bg-white shadow-[4px_0_16px_rgba(0,0,0,0.06)] lg:w-[38%] lg:flex-none dark:bg-slate-800 dark:shadow-none">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="flex h-full min-h-40 items-center justify-center px-6 text-center text-sm text-[#8f8f8f] dark:text-slate-400">
                {paidNote ?? 'Select a product to start the order'}
              </div>
            ) : (
              <ul>
                {cart.map((line) => {
                  const selected = line.id === selectedId;
                  return (
                    <li key={line.id}>
                      <button
                        type="button"
                        onClick={() => selectLine(line.id)}
                        className={`flex w-full flex-col gap-1 px-4 py-3 text-left ${
                          selected ? 'bg-[#d7e8ea] dark:bg-teal-900/40' : 'hover:bg-[#f7f7f7] dark:hover:bg-slate-700/40'
                        }`}
                      >
                        <span className="text-[15px] font-semibold text-[#212529] dark:text-slate-100">{line.name}</span>
                        <span className="flex items-baseline justify-between gap-3 text-sm text-[#4c4c4c] dark:text-slate-300">
                          <span>
                            {line.qty} × {money(line.price)}
                            {line.discount > 0 ? `  ·  ${line.discount}%` : ''}
                          </span>
                          <span className="text-base font-semibold tabular-nums text-[#212529] dark:text-slate-100">
                            {money(lineTotal(line))}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="grid shrink-0 grid-cols-4 gap-1.5 bg-[#f4f4f4] p-2 dark:bg-slate-900">
            {['1', '2', '3'].map((digit) => (
              <button key={digit} type="button" onClick={() => pressDigit(digit)} className="h-14 rounded-md bg-white text-xl font-medium text-[#212529] shadow-sm active:bg-[#ececec] sm:h-16 dark:bg-slate-800 dark:text-slate-100">
                {digit}
              </button>
            ))}
            {modeButton('qty', 'Qty')}
            {['4', '5', '6'].map((digit) => (
              <button key={digit} type="button" onClick={() => pressDigit(digit)} className="h-14 rounded-md bg-white text-xl font-medium text-[#212529] shadow-sm active:bg-[#ececec] sm:h-16 dark:bg-slate-800 dark:text-slate-100">
                {digit}
              </button>
            ))}
            {modeButton('disc', 'Disc')}
            {['7', '8', '9'].map((digit) => (
              <button key={digit} type="button" onClick={() => pressDigit(digit)} className="h-14 rounded-md bg-white text-xl font-medium text-[#212529] shadow-sm active:bg-[#ececec] sm:h-16 dark:bg-slate-800 dark:text-slate-100">
                {digit}
              </button>
            ))}
            {modeButton('price', 'Price')}
            <button type="button" aria-label="Backspace" onClick={pressBackspace} className="flex h-14 items-center justify-center rounded-md bg-white text-[#714B67] shadow-sm active:bg-[#ececec] sm:h-16 dark:bg-slate-800">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M20 6H9l-6 6 6 6h11a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1z" />
                <path d="m14 10-4 4m0-4 4 4" />
              </svg>
            </button>
            <button type="button" onClick={() => pressDigit('0')} className="h-14 rounded-md bg-white text-xl font-medium text-[#212529] shadow-sm active:bg-[#ececec] sm:h-16 dark:bg-slate-800 dark:text-slate-100">
              0
            </button>
            <button type="button" onClick={pressDot} className="h-14 rounded-md bg-white text-xl font-medium text-[#212529] shadow-sm active:bg-[#ececec] sm:h-16 dark:bg-slate-800 dark:text-slate-100">
              .
            </button>
            <button
              type="button"
              onClick={() => {
                if (!selectedId || mode === 'qty') {
                  return;
                }
                const next = buffer.startsWith('-') ? buffer.slice(1) : `-${buffer || '0'}`;
                setBuffer(next);
                setBufferFresh(false);
                updateSelected(next);
              }}
              className="h-14 rounded-md bg-white text-lg font-semibold text-[#212529] shadow-sm active:bg-[#ececec] sm:h-16 dark:bg-slate-800 dark:text-slate-100"
            >
              +/−
            </button>
          </div>

          <div className="grid shrink-0 grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] gap-2 bg-white p-2 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setCustomerIndex((index) => (index + 1) % CUSTOMERS.length)}
              className="flex h-16 items-center justify-center gap-2 rounded-md bg-[#f6f6f6] px-3 text-sm font-semibold text-[#212529] active:bg-[#ececec] dark:bg-slate-700 dark:text-slate-100"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-[#714B67]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="8" r="3" />
                <path d="M5 19c1.5-3 3.8-4.5 7-4.5S17.5 16 19 19" />
              </svg>
              <span className="truncate">{customer.name}</span>
            </button>
            <button
              type="button"
              onClick={pay}
              className="flex h-16 items-center justify-between gap-3 rounded-md bg-[#714B67] px-4 text-white shadow-md active:bg-[#5d3e55]"
            >
              <span className="text-lg font-semibold">Payment</span>
              <span className="text-xl font-bold tabular-nums">{money(grandTotal)}</span>
            </button>
          </div>
        </section>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#f0eeee] dark:bg-slate-900">
          <div className="shrink-0 space-y-3 px-3 pb-2 pt-3">
            <div className="relative">
              <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8f8f8f]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search products..."
                className="h-12 w-full rounded-md border-0 bg-white pl-12 pr-4 text-base text-[#212529] shadow-sm outline-none ring-[#714B67]/30 placeholder:text-[#9a9a9a] focus:ring-2 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {CATEGORIES.map((chip) => {
                const active = chip === category;
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setCategory(chip)}
                    className={`h-11 shrink-0 rounded-full px-5 text-sm font-semibold ${
                      active
                        ? 'bg-[#714B67] text-white'
                        : 'bg-white text-[#4c4c4c] shadow-sm dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {chip}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            {visibleProducts.length === 0 ? (
              <p className="px-2 py-10 text-center text-sm text-[#8f8f8f]">No products in this category.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {visibleProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addProduct(product)}
                    className="overflow-hidden rounded-md bg-white text-left shadow-sm active:scale-[0.98] dark:bg-slate-800"
                  >
                    <div className="flex aspect-[4/3] items-center justify-center" style={{ backgroundColor: product.color }}>
                      <span className="text-3xl font-semibold text-white/90">{product.name.slice(0, 1)}</span>
                    </div>
                    <div className="px-3 py-3">
                      <p className="line-clamp-2 min-h-10 text-sm font-semibold text-[#212529] dark:text-slate-100">{product.name}</p>
                      <p className="mt-1 text-sm font-medium tabular-nums text-[#714B67] dark:text-[#e7c6d8]">{money(product.price)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
