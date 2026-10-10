'use client';

import { useEffect, useMemo, useState } from 'react';
import { PosCameraScanner } from '../../components/PosCameraScanner';
import { AppShell } from '../../components/AppShell';

type Product = {
  barcode: string;
  name: string;
  price: number;
  vat: number;
};

type CartLine = {
  id: string;
  barcode: string;
  name: string;
  price: number;
  qty: number;
  vat: number;
  disc: number;
};

type PaymentType = 'Cash' | 'BKASH' | 'NAGAD' | 'Card';

const PRODUCTS: Product[] = [
  { barcode: '10000001', name: 'Oxford Shirt', price: 1850, vat: 5 },
  { barcode: '10000002', name: 'Navy Oxford', price: 1850, vat: 5 },
  { barcode: '10000003', name: 'Merino Polo', price: 2100, vat: 5 },
  { barcode: '10000004', name: 'Linen Tee', price: 1450, vat: 5 },
  { barcode: '10000007', name: 'Slim Chino', price: 2450, vat: 5 },
  { barcode: '10000008', name: 'Black Chino', price: 2450, vat: 5 },
  { barcode: '01-PP9800', name: 'Linen Trouser', price: 2750, vat: 5 },
  { barcode: '10000010', name: 'Straight Denim', price: 3200, vat: 5 },
];

const PAYMENT_TYPES: PaymentType[] = ['Cash', 'BKASH', 'NAGAD', 'Card'];

function money(amount: number) {
  const [whole, fraction] = Math.abs(amount).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${amount < 0 ? '-' : ''}${grouped}.${fraction}`;
}

function lineGross(line: CartLine) {
  return line.price * line.qty;
}

function lineDiscount(line: CartLine) {
  return lineGross(line) * (line.disc / 100);
}

function lineVat(line: CartLine) {
  return (lineGross(line) - lineDiscount(line)) * (line.vat / 100);
}

function lineTotal(line: CartLine) {
  return lineGross(line) - lineDiscount(line) + lineVat(line);
}

export default function PosPage() {
  const [scanCode, setScanCode] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [held, setHeld] = useState<CartLine[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [paymentType, setPaymentType] = useState<PaymentType>('Cash');
  const [nonCash, setNonCash] = useState('0.00');
  const [cardNumber, setCardNumber] = useState('');
  const [cashAmt, setCashAmt] = useState('0.00');
  const [paidAmount, setPaidAmount] = useState('0.00');
  const [clock, setClock] = useState('11 Oct 2026');

  useEffect(() => {
    const formatted = new Date().toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    setClock(formatted);
  }, []);

  const totals = useMemo(() => {
    const subTotal = cart.reduce((sum, line) => sum + lineGross(line), 0);
    const discount = cart.reduce((sum, line) => sum + lineDiscount(line), 0);
    const vat = cart.reduce((sum, line) => sum + lineVat(line), 0);
    const qty = cart.reduce((sum, line) => sum + line.qty, 0);
    return {
      lines: cart.length,
      qty,
      subTotal,
      discount,
      vat,
      net: subTotal - discount + vat,
    };
  }, [cart]);

  const paidValue = Number(paidAmount);
  const changeAmount = Number.isFinite(paidValue) ? paidValue - totals.net : 0;

  function addProduct(product: Product) {
    setStatus(null);
    setCart((current) => {
      const existing = current.find((line) => line.barcode === product.barcode);
      if (existing) {
        setSelectedId(existing.id);
        return current.map((line) => (line.id === existing.id ? { ...line, qty: line.qty + 1 } : line));
      }
      const id = `${product.barcode}-${Date.now()}`;
      setSelectedId(id);
      return [
        ...current,
        { id, barcode: product.barcode, name: product.name, price: product.price, qty: 1, vat: product.vat, disc: 0 },
      ];
    });
  }

  function submitScan(code: string) {
    const term = code.trim().toLowerCase();
    const product = PRODUCTS.find((item) => item.barcode.toLowerCase() === term || item.name.toLowerCase() === term);
    if (!product) {
      setScanNotice('No sample item matches that code.');
      return;
    }
    addProduct(product);
    setScanCode('');
    setScanNotice(null);
    setCameraOpen(false);
  }

  function updateLine(id: string, patch: Partial<Pick<CartLine, 'qty' | 'vat' | 'disc' | 'price'>>) {
    setCart((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function removeLine(id: string) {
    setCart((current) => current.filter((line) => line.id !== id));
    setSelectedId((current) => (current === id ? null : current));
  }

  function focusQty() {
    const id = selectedId ?? cart[0]?.id;
    if (!id) {
      return;
    }
    setSelectedId(id);
    window.setTimeout(() => document.getElementById(`qty-${id}`)?.focus(), 0);
  }

  function removeSelected() {
    if (selectedId) {
      removeLine(selectedId);
    }
  }

  function holdInvoice() {
    if (cart.length === 0 && held) {
      setCart(held);
      setHeld(null);
      setStatus('Held invoice restored.');
      return;
    }
    if (cart.length === 0) {
      return;
    }
    setHeld(cart);
    setCart([]);
    setSelectedId(null);
    setStatus('Invoice held.');
  }

  function cancelInvoice() {
    setCart([]);
    setSelectedId(null);
    setScanCode('');
    setScanNotice(null);
    setStatus('Invoice cancelled.');
    setPayOpen(false);
  }

  function openPay() {
    if (cart.length === 0) {
      setStatus('Add at least one item before payment.');
      return;
    }
    const net = totals.net.toFixed(2);
    setPaymentType('Cash');
    setNonCash('0.00');
    setCardNumber('');
    setCashAmt(net);
    setPaidAmount(net);
    setPayOpen(true);
  }

  function applyPaymentType(next: PaymentType) {
    setPaymentType(next);
    const net = totals.net.toFixed(2);
    if (next === 'Cash') {
      setNonCash('0.00');
      setCardNumber('');
      setCashAmt(net);
      setPaidAmount(net);
      return;
    }
    setNonCash(net);
    setCashAmt('0.00');
    setPaidAmount(net);
  }

  function confirmPay() {
    if (!Number.isFinite(paidValue) || paidValue < totals.net) {
      return;
    }
    const who = customerName.trim() || customerMobile.trim() || 'Walk-in';
    setStatus(`Paid ${money(totals.net)} · ${paymentType} · ${who}`);
    setCart([]);
    setSelectedId(null);
    setPayOpen(false);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (payOpen || cameraOpen) {
        return;
      }
      if (event.key === 'F2') {
        event.preventDefault();
        focusQty();
      } else if (event.key === 'F4') {
        event.preventDefault();
        removeSelected();
      } else if (event.key === 'F6') {
        event.preventDefault();
        holdInvoice();
      } else if (event.key === 'F10') {
        event.preventDefault();
        cancelInvoice();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <AppShell active="pos" mainClassName="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#eef1f4] p-0 dark:bg-slate-900">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
            <div className="shrink-0 xl:w-56">
              <p className="text-base font-semibold text-slate-900 dark:text-slate-100">Bashundhara City</p>
              <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">Terminal 01 · {clock}</p>
            </div>
            <div className="min-w-0 flex-1">
              <label htmlFor="pos-barcode" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Scan Barcode
              </label>
              <div className="flex items-stretch gap-2">
                <input
                  id="pos-barcode"
                  autoFocus
                  value={scanCode}
                  onChange={(event) => {
                    setScanCode(event.target.value);
                    setScanNotice(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      submitScan(scanCode);
                    }
                  }}
                  placeholder="Scan Barcode or Type Item Code"
                  className="min-h-[52px] min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-4 text-lg text-slate-900 outline-none ring-sky-500/30 placeholder:text-slate-400 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => setCameraOpen(true)}
                  className="inline-flex min-h-[52px] shrink-0 touch-manipulation items-center justify-center gap-2 rounded-md bg-[#714B67] px-4 text-sm font-semibold text-white active:bg-[#5d3e55]"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                    <circle cx="12" cy="13" r="3.5" />
                  </svg>
                  Scan with Camera
                </button>
              </div>
              {scanNotice ? <p className="mt-1 text-sm font-medium text-rose-600">{scanNotice}</p> : null}
            </div>
            <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:w-80">
              <label className="block text-xs font-semibold text-slate-500">
                Customer Mobile No
                <input
                  value={customerMobile}
                  onChange={(event) => setCustomerMobile(event.target.value)}
                  placeholder="01XXXXXXXXX"
                  className="mt-1 min-h-[48px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-500">
                Customer Name
                <input
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="Walk-in"
                  className="mt-1 min-h-[48px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <section className="min-h-0 min-w-0 flex-1 overflow-auto lg:w-3/4 lg:flex-none">
            <table className="min-w-[920px] w-full border-collapse bg-white text-left text-sm dark:bg-slate-800">
              <thead className="sticky top-0 z-10 bg-slate-800 text-xs font-semibold uppercase tracking-wide text-white">
                <tr>
                  <th className="px-3 py-2">SL No</th>
                  <th className="px-3 py-2">Barcode</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Price</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">VAT (%)</th>
                  <th className="px-3 py-2 text-right">Disc (%)</th>
                  <th className="px-3 py-2 text-right">Total Value</th>
                  <th className="px-3 py-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {cart.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center text-sm text-slate-500">
                      {status ?? 'Scan a barcode or type an item code to start the invoice.'}
                    </td>
                  </tr>
                ) : (
                  cart.map((line, index) => {
                    const selected = line.id === selectedId;
                    return (
                      <tr
                        key={line.id}
                        onClick={() => setSelectedId(line.id)}
                        className={`border-b border-slate-100 ${selected ? 'bg-sky-50 dark:bg-sky-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'} dark:border-slate-700`}
                      >
                        <td className="px-3 py-2 tabular-nums text-slate-600 dark:text-slate-300">{index + 1}</td>
                        <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100">{line.barcode}</td>
                        <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{line.name}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.price}
                            onChange={(event) => updateLine(line.id, { price: Math.max(0, Number(event.target.value) || 0) })}
                            className="h-10 w-24 rounded border border-slate-200 bg-white px-2 text-right tabular-nums dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            id={`qty-${line.id}`}
                            type="number"
                            min="1"
                            step="1"
                            value={line.qty}
                            onChange={(event) => updateLine(line.id, { qty: Math.max(1, Math.trunc(Number(event.target.value) || 1)) })}
                            className="h-10 w-16 rounded border border-slate-200 bg-white px-2 text-right tabular-nums dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.vat}
                            onChange={(event) => updateLine(line.id, { vat: Math.min(100, Math.max(0, Number(event.target.value) || 0)) })}
                            className="h-10 w-16 rounded border border-slate-200 bg-white px-2 text-right tabular-nums dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.disc}
                            onChange={(event) => updateLine(line.id, { disc: Math.min(100, Math.max(0, Number(event.target.value) || 0)) })}
                            className="h-10 w-16 rounded border border-slate-200 bg-white px-2 text-right tabular-nums dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">{money(lineTotal(line))}</td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              removeLine(line.id);
                            }}
                            className="min-h-[40px] touch-manipulation rounded bg-rose-50 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </section>

          <aside className="flex w-full shrink-0 flex-col gap-3 border-t border-slate-200 bg-white p-3 lg:w-1/4 lg:border-t-0 lg:border-l dark:border-slate-700 dark:bg-slate-800">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={focusQty} className="min-h-[48px] touch-manipulation rounded-md bg-sky-600 px-2 text-sm font-semibold text-white active:bg-sky-700">
                Change Qty <span className="block text-[11px] font-medium text-sky-100">F2</span>
              </button>
              <button type="button" onClick={removeSelected} className="min-h-[48px] touch-manipulation rounded-md bg-rose-600 px-2 text-sm font-semibold text-white active:bg-rose-700">
                Remove Item <span className="block text-[11px] font-medium text-rose-100">F4</span>
              </button>
              <button type="button" onClick={holdInvoice} className="min-h-[48px] touch-manipulation rounded-md bg-amber-500 px-2 text-sm font-semibold text-white active:bg-amber-600">
                Hold Invoice <span className="block text-[11px] font-medium text-amber-100">F6</span>
              </button>
              <button type="button" onClick={cancelInvoice} className="min-h-[48px] touch-manipulation rounded-md bg-slate-700 px-2 text-sm font-semibold text-white active:bg-slate-800">
                Cancel Invoice <span className="block text-[11px] font-medium text-slate-200">F10</span>
              </button>
            </div>

            <dl className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-600 dark:bg-slate-900">
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <dt>Total Line</dt>
                <dd className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{totals.lines}</dd>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <dt>Total Qty</dt>
                <dd className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{totals.qty}</dd>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <dt>Sub Total</dt>
                <dd className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{money(totals.subTotal)}</dd>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <dt>VAT</dt>
                <dd className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{money(totals.vat)}</dd>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <dt>Discount</dt>
                <dd className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{money(totals.discount)}</dd>
              </div>
              <div className="border-t border-slate-200 pt-2 dark:border-slate-700">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Net Amount</dt>
                <dd className="mt-1 text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-50">{money(totals.net)}</dd>
              </div>
            </dl>

            {held ? <p className="text-xs font-medium text-amber-700">One invoice is on hold. Press F6 to restore it.</p> : null}
            {status && cart.length > 0 ? <p className="text-xs font-medium text-slate-500">{status}</p> : null}

            <button
              type="button"
              onClick={openPay}
              className="mt-auto min-h-[64px] touch-manipulation rounded-md bg-emerald-600 text-xl font-bold text-white shadow-md active:bg-emerald-700 max-lg:sticky max-lg:bottom-0"
            >
              Pay Now
            </button>
          </aside>
        </div>
      </div>

      {cameraOpen ? (
        <PosCameraScanner regionId="pos-camera-reader" onScan={submitScan} onClose={() => setCameraOpen(false)} />
      ) : null}

      {payOpen ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/50 p-3 sm:items-center" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="invoice-payment-title" className="w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-2xl dark:bg-slate-800">
            <div className="flex items-center justify-between bg-slate-800 px-4 py-3 text-white">
              <h2 id="invoice-payment-title" className="text-base font-semibold">
                Invoice Payment
              </h2>
              <p className="text-sm text-slate-300">Bashundhara City · Terminal 01</p>
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-500">
                  Mobile
                  <input
                    value={customerMobile}
                    onChange={(event) => setCustomerMobile(event.target.value)}
                    className="mt-1 min-h-[48px] w-full rounded-md border border-slate-300 px-3 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-500">
                  Invoice Amount
                  <input
                    readOnly
                    value={money(totals.net)}
                    className="mt-1 min-h-[48px] w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-lg font-semibold tabular-nums dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-500">
                  Payment Type
                  <select
                    value={paymentType}
                    onChange={(event) => applyPaymentType(event.target.value as PaymentType)}
                    className="mt-1 min-h-[48px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  >
                    {PAYMENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-500">
                  Non-Cash Amt
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={nonCash}
                    onChange={(event) => setNonCash(event.target.value)}
                    className="mt-1 min-h-[48px] w-full rounded-md border border-slate-300 px-3 text-right text-sm tabular-nums dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-500">
                  Card Number
                  <input
                    value={cardNumber}
                    onChange={(event) => setCardNumber(event.target.value)}
                    disabled={paymentType !== 'Card'}
                    placeholder={paymentType === 'Card' ? 'XXXX XXXX XXXX XXXX' : 'Not required'}
                    className="mt-1 min-h-[48px] w-full rounded-md border border-slate-300 px-3 text-sm disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-700"
                  />
                </label>
              </div>
            </div>
            <div className="grid gap-3 border-t border-slate-200 px-4 py-4 sm:grid-cols-3 dark:border-slate-700">
              <label className="block text-xs font-semibold text-slate-500">
                Cash Amt
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cashAmt}
                  onChange={(event) => setCashAmt(event.target.value)}
                  className="mt-1 min-h-[48px] w-full rounded-md border border-slate-300 px-3 text-right tabular-nums dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-500">
                Paid Amount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paidAmount}
                  onChange={(event) => setPaidAmount(event.target.value)}
                  className="mt-1 min-h-[48px] w-full rounded-md border border-emerald-300 bg-emerald-50 px-3 text-right text-lg font-semibold tabular-nums dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-500">
                Change Amount
                <input
                  readOnly
                  value={money(Math.max(0, changeAmount))}
                  className="mt-1 min-h-[48px] w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-right text-lg font-bold tabular-nums text-emerald-700 dark:border-slate-600 dark:bg-slate-900 dark:text-emerald-300"
                />
              </label>
            </div>
            {changeAmount < 0 ? <p className="px-4 pb-2 text-sm font-medium text-rose-600">Paid amount is short by {money(Math.abs(changeAmount))}.</p> : null}
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
              <button type="button" onClick={() => setPayOpen(false)} className="min-h-[48px] touch-manipulation rounded-md bg-slate-200 px-6 text-sm font-semibold text-slate-800">
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmPay}
                className="min-h-[48px] touch-manipulation rounded-md bg-emerald-600 px-8 text-sm font-bold text-white disabled:bg-emerald-300"
                disabled={changeAmount < 0}
              >
                Ok
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
