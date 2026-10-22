'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PosCameraScanner } from '../../components/PosCameraScanner';
import { AddCustomerModal, type NewCustomerForm } from '../../components/pos/AddCustomerModal';
import { ReprintModal } from '../../components/pos/ReprintModal';
import { SearchCustomerModal, type PosCustomerRow } from '../../components/pos/SearchCustomerModal';
import { AppShell } from '../../components/AppShell';
import type { CatalogProduct } from '../../components/ProductEditor';
import { API_BASE } from '../../utils/api';
import { fetchJson, useApi } from '../../utils/query';

type CartLine = {
  id: string;
  barcode: string;
  name: string;
  price: number;
  qty: number;
  vat: number;
  disc: number;
};

type ProductTable = {
  items?: CatalogProduct[];
  pages?: number;
};

type Sellable = {
  id: string;
  barcode: string;
  name: string;
  price: number;
  vat: number;
};

type InvoiceCustomer = {
  id: string | number | null;
  code: string;
  phone: string;
  name: string;
  address: string;
};

type SaleReceipt = {
  invoiceNo: string;
  issuedAt: string;
  customer: InvoiceCustomer;
  lines: CartLine[];
  qty: number;
  total: number;
  sd: number;
  vat: number;
  discountPercent: string;
  discount: number;
  returnAmount: number;
  subTotal: number;
  net: number;
  payments: { method: string; amount: number; bankName?: string; accountNumber?: string }[];
  paid: number;
  change: number;
};

type CustomerHit = {
  id?: string | number | null;
  customer_phone?: string;
  phone?: string;
  name?: string;
  customer_name?: string;
};

const CATALOG_PAGE = `${API_BASE}/products/table?page=1&page_size=100&status=active`;

const DEFAULT_PAYMENT_METHODS = ['Cash', 'BKASH', 'NAGAD', 'Card'];

function isCardMethod(method: string) {
  return /card/i.test(method);
}

function sellable(id: string, barcode: string, name: string, price: number, vat: number): Sellable {
  return { id, barcode, name, price, vat };
}

function indexCatalog(products: CatalogProduct[]) {
  const map = new Map<string, Sellable>();
  for (const product of products) {
    if (!product.is_active || product.is_hidden) {
      continue;
    }
    const parent = sellable(`p-${product.id}`, product.item_code || product.barcode, product.name, product.price, product.sale_vat ?? 0);
    const codes = [product.barcode, product.item_code, product.design_code, ...(product.additional_barcodes ?? [])];
    for (const code of codes) {
      const key = code?.trim().toLowerCase();
      if (key) {
        map.set(key, parent);
      }
    }
    for (const variant of product.variants ?? []) {
      const sku = variant.sku?.trim();
      if (!sku) {
        continue;
      }
      const label = Object.values(variant.attributes ?? {}).filter(Boolean).join(' / ');
      map.set(
        sku.toLowerCase(),
        sellable(
          variant.id ? `v-${variant.id}` : `v-${sku}`,
          sku,
          label ? `${product.name} (${label})` : product.name,
          variant.effective_price ?? product.price,
          variant.sale_vat ?? product.sale_vat ?? 0,
        ),
      );
    }
  }
  return map;
}

function customerLabel(row: CustomerHit) {
  const name = row.customer_name?.trim() || row.name?.trim() || '';
  return name;
}

function customerKey(row: CustomerHit) {
  return row.id ?? row.customer_phone ?? row.phone ?? null;
}

function money(amount: number) {
  const [whole, fraction] = Math.abs(amount).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${amount < 0 ? '-' : ''}${grouped}.${fraction}`;
}

function clampPercent(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.min(100, Math.max(0, parsed));
}

function formatAmountInput(value: number) {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function formatPercentInput(value: number) {
  return String(Math.round(value * 100) / 100);
}

type TenderEntry = { on: boolean; amount: string; bankName: string; accountNumber: string };

type TenderState = Record<string, TenderEntry>;

function blankTender(): TenderEntry {
  return { on: false, amount: '', bankName: '', accountNumber: '' };
}

function blankTenders(methods: string[]): TenderState {
  return Object.fromEntries(methods.map((method) => [method, blankTender()]));
}

function tenderTotal(tenders: TenderState, methods: string[]) {
  return methods.reduce((sum, method) => {
    const tender = tenders[method];
    if (!tender?.on) {
      return sum;
    }
    const value = Number(tender.amount);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
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

function ThermalReceipt({ sale }: { sale: SaleReceipt }) {
  const customerBits = [sale.customer.name, sale.customer.phone, sale.customer.address].filter(Boolean);
  return (
    <>
      <style>{`
        @media screen {
          #pos-receipt { position: absolute; width: 0; height: 0; overflow: hidden; }
        }
        @media print {
          body * { visibility: hidden; }
          #pos-receipt, #pos-receipt * { visibility: visible; }
          #pos-receipt {
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm;
            height: auto;
            overflow: visible;
            background: #fff;
            color: #000;
          }
          @page { size: 80mm auto; margin: 4mm; }
        }
      `}</style>
      <article id="pos-receipt" className="bg-white font-mono text-[11px] leading-snug text-black">
        <header className="border-b border-dashed border-black pb-2 text-center">
          <p className="text-sm font-bold">Bashundhara City</p>
          <p>Terminal 01</p>
          <p>{sale.issuedAt}</p>
          <p className="font-bold">Invoice {sale.invoiceNo}</p>
        </header>
        {customerBits.length > 0 ? (
          <p className="border-b border-dashed border-black py-2">
            {sale.customer.code ? `Customer ${sale.customer.code}` : 'Customer'}
            <br />
            {customerBits.join(' · ')}
          </p>
        ) : (
          <p className="border-b border-dashed border-black py-2">Walk-in</p>
        )}
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="py-1 font-semibold">Item</th>
              <th className="py-1 text-right font-semibold">Qty</th>
              <th className="py-1 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {sale.lines.map((line, index) => (
              <tr key={line.id} className="align-top">
                <td className="py-1 pr-2">
                  {index + 1}. {line.name}
                  <br />
                  <span>
                    {line.barcode} · {money(line.price)}
                    {line.vat ? ` · VAT ${line.vat}%` : ''}
                    {line.disc ? ` · Disc ${line.disc}%` : ''}
                  </span>
                </td>
                <td className="py-1 text-right tabular-nums">{line.qty}</td>
                <td className="py-1 text-right tabular-nums">{money(lineTotal(line))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-1 space-y-0.5 border-t border-dashed border-black pt-2">
          <div className="flex justify-between"><dt>Total Line</dt><dd className="tabular-nums">{sale.lines.length}</dd></div>
          <div className="flex justify-between"><dt>Total Qty</dt><dd className="tabular-nums">{sale.qty}</dd></div>
          <div className="flex justify-between"><dt>Total</dt><dd className="tabular-nums">{money(sale.total)}</dd></div>
          <div className="flex justify-between"><dt>SD Amount</dt><dd className="tabular-nums">{money(sale.sd)}</dd></div>
          <div className="flex justify-between"><dt>VAT</dt><dd className="tabular-nums">{money(sale.vat)}</dd></div>
          <div className="flex justify-between"><dt>Discount (%)</dt><dd className="tabular-nums">{sale.discountPercent}</dd></div>
          <div className="flex justify-between"><dt>Discount</dt><dd className="tabular-nums">{money(sale.discount)}</dd></div>
          <div className="flex justify-between"><dt>Return Amount</dt><dd className="tabular-nums">{money(sale.returnAmount)}</dd></div>
          <div className="flex justify-between"><dt>Sub Total</dt><dd className="tabular-nums">{money(sale.subTotal)}</dd></div>
          <div className="flex justify-between text-sm font-bold"><dt>NET AMOUNT</dt><dd className="tabular-nums">{money(sale.net)}</dd></div>
        </dl>
        <div className="mt-2 border-t border-dashed border-black pt-2">
          {sale.payments.map((payment) => (
            <div key={payment.method} className="flex justify-between gap-2">
              <span>
                {payment.method}
                {payment.bankName ? ` · ${payment.bankName}` : ''}
                {payment.accountNumber ? ` · ${payment.accountNumber}` : ''}
              </span>
              <span className="shrink-0 tabular-nums">{money(payment.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between"><span>Total Paid</span><span className="tabular-nums">{money(sale.paid)}</span></div>
          <div className="flex justify-between font-bold"><span>Change</span><span className="tabular-nums">{money(sale.change)}</span></div>
        </div>
        <p className="mt-3 text-center">Thank you</p>
      </article>
    </>
  );
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
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerCode, setCustomerCode] = useState('');
  const [customerId, setCustomerId] = useState<string | number | null>(null);
  const [directory, setDirectory] = useState<PosCustomerRow[]>([]);
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [isSearchCustomerOpen, setIsSearchCustomerOpen] = useState(false);
  const [isReprintOpen, setIsReprintOpen] = useState(false);
  const [orderDiscountPercent, setOrderDiscountPercent] = useState('0');
  const [orderDiscountAmount, setOrderDiscountAmount] = useState('0.00');
  const [returnAmount, setReturnAmount] = useState(0);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const customerNameRef = useRef<HTMLInputElement>(null);
  const latestIdRef = useRef<string | null>(null);
  const discountEditRef = useRef<'percent' | 'amount'>('percent');
  const percentRef = useRef('0');
  const amountRef = useRef('0.00');
  const tenderRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [payOpen, setPayOpen] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState(['Cash', 'BKASH', 'NAGAD', 'Card']);
  const [banks, setBanks] = useState(['City Bank', 'Brac Bank', 'DBBL']);
  const [newMethod, setNewMethod] = useState('');
  const [newBank, setNewBank] = useState('');
  const [tenders, setTenders] = useState<TenderState>(() => blankTenders(DEFAULT_PAYMENT_METHODS));
  const [payError, setPayError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);
  const [clock, setClock] = useState('11 Oct 2026');
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const { data: firstPage, error: catalogError } = useApi<ProductTable>(CATALOG_PAGE);

  useEffect(() => {
    if (!firstPage) {
      return;
    }
    const firstItems = firstPage.items ?? [];
    setCatalog(firstItems);
    const pages = firstPage.pages ?? 1;
    if (pages <= 1) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const items = [...firstItems];
      for (let page = 2; page <= pages; page += 1) {
        const next = await fetchJson<ProductTable>(`${API_BASE}/products/table?page=${page}&page_size=100&status=active`);
        items.push(...(next.items ?? []));
      }
      if (!cancelled) {
        setCatalog(items);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firstPage]);

  const productIndex = useMemo(() => indexCatalog(catalog), [catalog]);

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
    const total = cart.reduce((sum, line) => sum + lineGross(line), 0);
    const totalLineDiscount = cart.reduce((sum, line) => sum + lineDiscount(line), 0);
    const vat = cart.reduce((sum, line) => sum + lineVat(line), 0);
    const qty = cart.reduce((sum, line) => sum + line.qty, 0);
    const sd = 0;
    const discountBase = Math.max(0, total + sd + vat - totalLineDiscount - returnAmount);
    const parsedAmount = Number(orderDiscountAmount);
    const orderAmount = Number.isFinite(parsedAmount) ? Math.min(discountBase, Math.max(0, parsedAmount)) : 0;
    const discount = totalLineDiscount + orderAmount;
    const subTotal = discountBase - orderAmount;
    return {
      lines: cart.length,
      qty,
      total,
      sd,
      vat,
      discountBase,
      discount,
      returnAmount,
      subTotal,
      net: subTotal,
    };
  }, [cart, orderDiscountAmount, returnAmount]);

  percentRef.current = orderDiscountPercent;
  amountRef.current = orderDiscountAmount;

  useEffect(() => {
    const base = totals.discountBase;
    if (discountEditRef.current === 'amount') {
      const raw = Number(amountRef.current);
      const amount = Number.isFinite(raw) ? Math.min(Math.max(0, raw), base) : 0;
      const percent = base > 0 ? (amount / base) * 100 : 0;
      setOrderDiscountPercent(formatPercentInput(percent));
      setOrderDiscountAmount(formatAmountInput(amount));
      return;
    }
    const percent = clampPercent(percentRef.current);
    setOrderDiscountAmount(formatAmountInput((base * percent) / 100));
  }, [totals.discountBase]);

  const totalPaid = tenderTotal(tenders, paymentMethods);
  const dueAmount = Math.max(0, Math.round((totals.net - totalPaid) * 100) / 100);
  const changeAmount = Math.max(0, Math.round((totalPaid - totals.net) * 100) / 100);
  const currentOrder = useMemo(
    () => ({
      customer: {
        id: customerId,
        code: customerCode.trim(),
        phone: customerMobile.trim(),
        name: customerName.trim(),
        address: customerAddress.trim(),
      } satisfies InvoiceCustomer,
      items: cart,
      totals,
    }),
    [cart, customerAddress, customerCode, customerId, customerMobile, customerName, totals],
  );

  function focusBarcode() {
    window.setTimeout(() => barcodeRef.current?.focus(), 0);
  }

  function addProduct(product: Sellable) {
    setStatus(null);
    latestIdRef.current = product.id;
    setSelectedId(product.id);
    setCart((current) => {
      const existing = current.find((line) => line.id === product.id);
      if (existing) {
        return current.map((line) => (line.id === product.id ? { ...line, qty: line.qty + 1 } : line));
      }
      return [...current, { id: product.id, barcode: product.barcode, name: product.name, price: product.price, qty: 1, vat: product.vat, disc: 0 }];
    });
  }

  function submitScan(code: string) {
    const term = code.trim().toLowerCase();
    if (!term) {
      return;
    }
    if (!firstPage && !catalogError) {
      setScanNotice('Products are still loading.');
      return;
    }
    const product = productIndex.get(term);
    if (!product) {
      setScanNotice(catalogError ? 'Unable to load products from the server.' : 'No item matches that code.');
      return;
    }
    addProduct(product);
    setScanCode('');
    setScanNotice(null);
    setCameraOpen(false);
    focusBarcode();
  }

  async function lookupCustomer(phone: string) {
    const trimmed = phone.trim();
    if (!trimmed) {
      focusBarcode();
      return;
    }
    try {
      const rows = await fetchJson<CustomerHit[]>(`${API_BASE}/customers/?phone=${encodeURIComponent(trimmed)}`);
      const needle = trimmed.replace(/\D/g, '');
      const match = (Array.isArray(rows) ? rows : []).find((row) => {
        const value = (row.customer_phone || row.phone || '').replace(/\D/g, '');
        return needle.length > 0 && value === needle;
      });
      if (match) {
        const name = customerLabel(match);
        const key = customerKey(match);
        setCustomerId(key);
        setCustomerCode(key == null ? '' : String(key));
        if (name) {
          setCustomerName(name);
          focusBarcode();
          return;
        }
        customerNameRef.current?.focus();
        return;
      }
    } catch {
      setCustomerId(null);
    }
    setCustomerId(null);
    customerNameRef.current?.focus();
  }

  function updateLine(id: string, patch: Partial<Pick<CartLine, 'qty' | 'vat' | 'disc' | 'price'>>) {
    setCart((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function removeLine(id: string) {
    setCart((current) => {
      const next = current.filter((line) => line.id !== id);
      if (latestIdRef.current === id) {
        latestIdRef.current = next[next.length - 1]?.id ?? null;
      }
      return next;
    });
    setSelectedId((current) => (current === id ? null : current));
    focusBarcode();
  }

  function focusQty() {
    const id = latestIdRef.current ?? cart[cart.length - 1]?.id ?? selectedId;
    if (!id) {
      return;
    }
    setSelectedId(id);
    window.setTimeout(() => document.getElementById(`qty-${id}`)?.focus(), 0);
  }

  function removeSelected() {
    const id = selectedId ?? latestIdRef.current ?? cart[cart.length - 1]?.id;
    if (id) {
      removeLine(id);
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
    latestIdRef.current = null;
    setCart([]);
    setSelectedId(null);
    setScanCode('');
    setScanNotice(null);
    setCustomerMobile('');
    setCustomerName('');
    setCustomerAddress('');
    setCustomerCode('');
    setCustomerId(null);
    setOrderDiscountPercent('0');
    setOrderDiscountAmount('0.00');
    discountEditRef.current = 'percent';
    setReturnAmount(0);
    setStatus('Invoice cancelled.');
    setPayOpen(false);
    focusBarcode();
  }

  function onDiscountPercentChange(value: string) {
    discountEditRef.current = 'percent';
    setOrderDiscountPercent(value);
    setOrderDiscountAmount(formatAmountInput((totals.discountBase * clampPercent(value)) / 100));
  }

  function onDiscountAmountChange(value: string) {
    discountEditRef.current = 'amount';
    const parsed = Number(value);
    if (value.trim() === '' || !Number.isFinite(parsed)) {
      setOrderDiscountAmount(value);
      setOrderDiscountPercent('0');
      return;
    }
    const capped = Math.min(Math.max(0, parsed), totals.discountBase);
    setOrderDiscountAmount(parsed > totals.discountBase ? formatAmountInput(capped) : value);
    const percent = totals.discountBase > 0 ? (capped / totals.discountBase) * 100 : 0;
    setOrderDiscountPercent(formatPercentInput(percent));
  }

  function openPay() {
    if (cart.length === 0) {
      setStatus('Add at least one item before payment.');
      return;
    }
    setTenders(blankTenders(paymentMethods));
    setNewMethod('');
    setNewBank('');
    setPayError(null);
    setPayOpen(true);
  }

  function toggleTender(method: string, on: boolean) {
    setPayError(null);
    setTenders((current) => {
      const previous = current[method] ?? blankTender();
      if (!on) {
        return { ...current, [method]: { ...previous, on: false, amount: '' } };
      }
      const paidByOthers = paymentMethods.reduce((sum, key) => {
        if (key === method || !current[key]?.on) {
          return sum;
        }
        const value = Number(current[key].amount);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0);
      const due = Math.round((totals.net - paidByOthers) * 100) / 100;
      return {
        ...current,
        [method]: {
          ...previous,
          on: true,
          amount: due > 0 ? due.toFixed(2) : '',
          bankName: isCardMethod(method) ? previous.bankName || banks[0] || '' : '',
        },
      };
    });
    if (on) {
      window.setTimeout(() => {
        tenderRefs.current[method]?.focus();
        tenderRefs.current[method]?.select();
      }, 0);
    }
  }

  function setTenderAmount(method: string, amount: string) {
    setPayError(null);
    setTenders((current) => ({ ...current, [method]: { ...(current[method] ?? blankTender()), amount } }));
  }

  function setTenderBank(method: string, patch: Partial<Pick<TenderEntry, 'bankName' | 'accountNumber'>>) {
    setTenders((current) => ({ ...current, [method]: { ...(current[method] ?? blankTender()), ...patch } }));
  }

  function addPaymentMethod() {
    const name = newMethod.trim();
    if (!name) {
      return;
    }
    if (paymentMethods.some((method) => method.toLowerCase() === name.toLowerCase())) {
      setNewMethod('');
      return;
    }
    setPaymentMethods((current) => [...current, name]);
    setTenders((current) => ({ ...current, [name]: blankTender() }));
    setNewMethod('');
    // TODO: POST the new payment method to the backend payment-methods API so every terminal sees it.
  }

  function addBank() {
    const name = newBank.trim();
    if (!name) {
      return;
    }
    if (banks.some((bank) => bank.toLowerCase() === name.toLowerCase())) {
      setNewBank('');
      return;
    }
    setBanks((current) => [...current, name]);
    setTenders((current) => {
      const next = { ...current };
      for (const method of paymentMethods) {
        const tender = next[method];
        if (isCardMethod(method) && tender?.on && !tender.bankName) {
          next[method] = { ...tender, bankName: name };
        }
      }
      return next;
    });
    setNewBank('');
    // TODO: POST the new bank name to the backend banks API so every terminal sees it.
  }

  function resetSale() {
    latestIdRef.current = null;
    setCart([]);
    setSelectedId(null);
    setCustomerMobile('');
    setCustomerName('');
    setCustomerAddress('');
    setCustomerCode('');
    setCustomerId(null);
    setOrderDiscountPercent('0');
    setOrderDiscountAmount('0.00');
    discountEditRef.current = 'percent';
    setReturnAmount(0);
    setPayError(null);
    setTenders(blankTenders(paymentMethods));
    setPayOpen(false);
  }

  function confirmPay() {
    const paid = tenderTotal(tenders, paymentMethods);
    const shortfall = Math.round((totals.net - paid) * 100) / 100;
    if (shortfall > 0) {
      setPayError(`Payment Incomplete! Due Amount: ${money(shortfall)} TK`);
      return;
    }
    const payments = paymentMethods.flatMap((method) => {
      const tender = tenders[method];
      if (!tender?.on || !(Number(tender.amount) > 0)) {
        return [];
      }
      const card = isCardMethod(method);
      return [
        {
          method,
          amount: Number(tender.amount),
          ...(card && tender.bankName ? { bankName: tender.bankName } : {}),
          ...(card && tender.accountNumber.trim() ? { accountNumber: tender.accountNumber.trim() } : {}),
        },
      ];
    });
    const who = currentOrder.customer.name || currentOrder.customer.phone || 'Walk-in';
    setStatus(`Paid ${money(totals.net)} · ${payments.map((payment) => payment.method).join(', ') || 'Cash'} · ${who}`);
    setPayOpen(false);
    setReceipt({
      invoiceNo: `INV${Date.now().toString().slice(-8)}`,
      issuedAt: new Date().toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      customer: currentOrder.customer,
      lines: cart.map((line) => ({ ...line })),
      qty: totals.qty,
      total: totals.total,
      sd: totals.sd,
      vat: totals.vat,
      discountPercent: orderDiscountPercent,
      discount: totals.discount,
      returnAmount: totals.returnAmount,
      subTotal: totals.subTotal,
      net: totals.net,
      payments,
      paid,
      change: Math.max(0, Math.round((paid - totals.net) * 100) / 100),
    });
  }

  function applyCustomer(row: PosCustomerRow) {
    setCustomerCode(row.id);
    setCustomerId(row.id);
    setCustomerName(row.firstName);
    setCustomerMobile(row.phone);
    setCustomerAddress(row.address);
    setIsSearchCustomerOpen(false);
    setIsAddCustomerOpen(false);
    focusBarcode();
  }

  function saveCustomer(form: NewCustomerForm) {
    const id = `C-${form.phone.replace(/\D/g, '') || Date.now()}`;
    const row: PosCustomerRow = {
      id,
      firstName: form.firstName.trim() || form.phone.trim(),
      phone: form.phone.trim(),
      type: form.type,
      discount: Number(form.discount) || 0,
      doe: form.doe,
      address: [form.address, form.city].filter(Boolean).join(', '),
    };
    setDirectory((current) => [row, ...current.filter((item) => item.id !== row.id)]);
    const name = [form.firstName, form.middleName, form.lastName].map((part) => part.trim()).filter(Boolean).join(' ');
    applyCustomer({ ...row, firstName: name || row.firstName });
    console.log('Save customer', form);
  }

  function exchangeItem() {
    console.log('Exchange');
    setStatus('Exchange started.');
  }

  function recallInvoice() {
    console.log('Recall invoice', held);
    if (!held || held.length === 0) {
      setStatus('No held invoice to recall.');
      return;
    }
    setCart(held);
    setHeld(null);
    latestIdRef.current = held[held.length - 1]?.id ?? null;
    setStatus('Held invoice recalled.');
  }

  function returnSale() {
    console.log('Return');
    setStatus('Return started.');
  }

  function reprintInvoice(invoiceNumber: string) {
    console.log('Reprint invoice', invoiceNumber);
    setStatus(`Reprint queued for ${invoiceNumber}.`);
    setIsReprintOpen(false);
    focusBarcode();
  }

  useEffect(() => {
    if (!receipt) {
      return;
    }
    function finishPrinting() {
      resetSale();
      setReceipt(null);
      focusBarcode();
    }
    window.addEventListener('afterprint', finishPrinting);
    const timer = window.setTimeout(() => window.print(), 50);
    return () => {
      window.removeEventListener('afterprint', finishPrinting);
      window.clearTimeout(timer);
    };
  }, [receipt]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (payOpen || cameraOpen || isAddCustomerOpen || isSearchCustomerOpen || isReprintOpen) {
        return;
      }
      if (event.key === 'F2') {
        event.preventDefault();
        focusQty();
      } else if (event.key === 'F3') {
        event.preventDefault();
        exchangeItem();
      } else if (event.key === 'F4') {
        event.preventDefault();
        removeSelected();
      } else if (event.key === 'F6') {
        event.preventDefault();
        holdInvoice();
      } else if (event.key === 'F7') {
        event.preventDefault();
        recallInvoice();
      } else if (event.key === 'F8') {
        event.preventDefault();
        returnSale();
      } else if (event.key === 'F10') {
        event.preventDefault();
        cancelInvoice();
      } else if (event.key === 'F12' || (event.key === 'Enter' && event.shiftKey)) {
        event.preventDefault();
        openPay();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <AppShell active="pos" mainClassName="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#eef1f4] p-0 dark:bg-slate-900">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
          <div>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">Bashundhara City</p>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Terminal 01 · {clock}</p>
          </div>
          <button
            type="button"
            onClick={() => setIsReprintOpen(true)}
            className="min-h-[44px] rounded-md bg-orange-500 px-4 text-sm font-bold text-white active:bg-orange-600"
          >
            Reprint
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:w-3/4 lg:flex-none">
            <div className="shrink-0 space-y-2 border-b border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
              <div>
                <label htmlFor="pos-barcode" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Scan Barcode
                </label>
                <div className="flex items-stretch gap-2">
                  <input
                    id="pos-barcode"
                    ref={barcodeRef}
                    autoFocus
                    value={scanCode}
                    onChange={(event) => {
                      setScanCode(event.target.value);
                      setScanNotice(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
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
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-xs font-semibold text-slate-500">
                  Customer Id
                  <span className="mt-1 flex gap-1">
                    <input
                      value={customerCode}
                      onChange={(event) => setCustomerCode(event.target.value)}
                      className="min-h-[44px] min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      aria-label="Add Customer"
                      onClick={() => setIsAddCustomerOpen(true)}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md bg-emerald-600 text-xl font-bold text-white"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      aria-label="Search customer"
                      onClick={() => setIsSearchCustomerOpen(true)}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md bg-orange-500 text-white"
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-3.5-3.5" />
                      </svg>
                    </button>
                  </span>
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  Mobile No
                  <input
                    value={customerMobile}
                    onChange={(event) => {
                      setCustomerMobile(event.target.value);
                      setCustomerId(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void lookupCustomer(customerMobile);
                      }
                    }}
                    placeholder="01XXXXXXXXX"
                    className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  Name
                  <input
                    id="pos-customer-name"
                    ref={customerNameRef}
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        focusBarcode();
                      }
                    }}
                    placeholder="Walk-in"
                    className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  Address
                  <input
                    value={customerAddress}
                    onChange={(event) => setCustomerAddress(event.target.value)}
                    className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
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
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                focusBarcode();
                              }
                            }}
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
            </div>
          </section>

          <aside className="flex w-full shrink-0 flex-col gap-3 border-t border-slate-200 bg-white p-3 lg:w-1/4 lg:border-t-0 lg:border-l dark:border-slate-700 dark:bg-slate-800">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={focusQty} className="min-h-[48px] touch-manipulation rounded-md bg-sky-600 px-2 text-sm font-semibold text-white active:bg-sky-700">
                Change Qty <span className="block text-[11px] font-medium text-sky-100">F2</span>
              </button>
              <button type="button" onClick={exchangeItem} className="min-h-[48px] touch-manipulation rounded-md bg-violet-600 px-2 text-sm font-semibold text-white active:bg-violet-700">
                Exchange <span className="block text-[11px] font-medium text-violet-100">F3</span>
              </button>
              <button type="button" onClick={removeSelected} className="min-h-[48px] touch-manipulation rounded-md bg-rose-600 px-2 text-sm font-semibold text-white active:bg-rose-700">
                Remove Item <span className="block text-[11px] font-medium text-rose-100">F4</span>
              </button>
              <button type="button" onClick={holdInvoice} className="min-h-[48px] touch-manipulation rounded-md bg-amber-500 px-2 text-sm font-semibold text-white active:bg-amber-600">
                Hold Invoice <span className="block text-[11px] font-medium text-amber-100">F6</span>
              </button>
              <button type="button" onClick={recallInvoice} className="min-h-[48px] touch-manipulation rounded-md bg-indigo-600 px-2 text-sm font-semibold text-white active:bg-indigo-700">
                Recall Invoice <span className="block text-[11px] font-medium text-indigo-100">F7</span>
              </button>
              <button type="button" onClick={returnSale} className="min-h-[48px] touch-manipulation rounded-md bg-fuchsia-700 px-2 text-sm font-semibold text-white active:bg-fuchsia-800">
                Return <span className="block text-[11px] font-medium text-fuchsia-100">F8</span>
              </button>
              <button type="button" onClick={cancelInvoice} className="min-h-[48px] touch-manipulation rounded-md bg-slate-700 px-2 text-sm font-semibold text-white active:bg-slate-800">
                Cancel Invoice <span className="block text-[11px] font-medium text-slate-200">F10</span>
              </button>
            </div>

            {held ? <p className="text-xs font-medium text-amber-700">One invoice is on hold. Press F7 to recall it.</p> : null}
            {status && cart.length > 0 ? <p className="text-xs font-medium text-slate-500">{status}</p> : null}

            <div className="space-y-1">
              {(
                [
                  ['Total Line', String(totals.lines)],
                  ['Total Qty', String(totals.qty)],
                  ['Total', money(totals.total)],
                  ['SD Amount', money(totals.sd)],
                  ['VAT', money(totals.vat)],
                ] as const
              ).map(([label, value]) => (
                <label key={label} className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                  <span>{label}</span>
                  <input readOnly tabIndex={-1} value={value} className="h-7 w-28 rounded border border-slate-300 bg-slate-100 px-2 text-right text-xs tabular-nums text-slate-800 outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100" />
                </label>
              ))}
              <label className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                <span>Discount (%)</span>
                <input
                  value={orderDiscountPercent}
                  onChange={(event) => onDiscountPercentChange(event.target.value)}
                  inputMode="decimal"
                  className="h-7 w-28 rounded border border-slate-400 bg-slate-100 px-2 text-right text-xs tabular-nums text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-sky-500/30 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100 dark:focus:bg-slate-900"
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                <span>Discount</span>
                <input
                  value={orderDiscountAmount}
                  onChange={(event) => onDiscountAmountChange(event.target.value)}
                  inputMode="decimal"
                  className="h-7 w-28 rounded border border-slate-400 bg-slate-100 px-2 text-right text-xs tabular-nums text-slate-900 outline-none focus:bg-white focus:ring-2 focus:ring-sky-500/30 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100 dark:focus:bg-slate-900"
                />
              </label>
              {(
                [
                  ['Return Amount', money(totals.returnAmount)],
                  ['Sub Total', money(totals.subTotal)],
                ] as const
              ).map(([label, value]) => (
                <label key={label} className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                  <span>{label}</span>
                  <input readOnly tabIndex={-1} value={value} className="h-7 w-28 rounded border border-slate-300 bg-slate-100 px-2 text-right text-xs tabular-nums text-slate-800 outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100" />
                </label>
              ))}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Net Amount</p>
              <p className="text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-50">{money(totals.net)}</p>
            </div>

            <button
              type="button"
              onClick={() => setIsReprintOpen(true)}
              className="min-h-[44px] touch-manipulation rounded-md bg-orange-500 text-sm font-bold text-white active:bg-orange-600"
            >
              Reprint
            </button>
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
      {isAddCustomerOpen ? <AddCustomerModal onClose={() => setIsAddCustomerOpen(false)} onSave={saveCustomer} /> : null}
      {isSearchCustomerOpen ? (
        <SearchCustomerModal extraRows={directory} onClose={() => setIsSearchCustomerOpen(false)} onSelect={applyCustomer} />
      ) : null}
      {isReprintOpen ? <ReprintModal onClose={() => setIsReprintOpen(false)} onReprint={reprintInvoice} /> : null}

      {payOpen ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/50 p-3 sm:items-center" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="invoice-payment-title"
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey) {
                return;
              }
              const target = event.target;
              if (
                target instanceof HTMLButtonElement ||
                target instanceof HTMLSelectElement ||
                (target instanceof HTMLInputElement && (target.type === 'checkbox' || target.dataset.skipPay === 'true'))
              ) {
                return;
              }
              event.preventDefault();
              confirmPay();
            }}
            className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl dark:bg-slate-800"
          >
            <div className="flex items-center justify-between bg-slate-800 px-4 py-3 text-white">
              <h2 id="invoice-payment-title" className="text-base font-semibold">
                Invoice Payment
              </h2>
              <p className="text-sm text-slate-300">Bashundhara City · Terminal 01</p>
            </div>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-4">
              {paymentMethods.map((method) => {
                const tender = tenders[method] ?? blankTender();
                const showBank = tender.on && isCardMethod(method);
                const showAddBank =
                  showBank && paymentMethods.find((name) => isCardMethod(name) && tenders[name]?.on) === method;
                return (
                  <div key={method}>
                    <div className="flex items-center gap-3">
                      <label title={method} className="flex min-h-11 w-32 shrink-0 items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                        <input
                          type="checkbox"
                          checked={tender.on}
                          onChange={(event) => toggleTender(method, event.target.checked)}
                          className="h-4 w-4 shrink-0 accent-emerald-600"
                        />
                        <span className="truncate">{method}</span>
                      </label>
                      {tender.on ? (
                        <input
                          ref={(node) => {
                            tenderRefs.current[method] = node;
                          }}
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={tender.amount}
                          onChange={(event) => setTenderAmount(method, event.target.value)}
                          aria-label={`${method} amount`}
                          className="h-11 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                        />
                      ) : (
                        <div className="h-11 flex-1" />
                      )}
                    </div>
                    {showBank ? (
                      <div className="mb-1 ml-6 flex flex-wrap items-center gap-1.5">
                        <select
                          aria-label={`${method} bank`}
                          value={tender.bankName}
                          onChange={(event) => setTenderBank(method, { bankName: event.target.value })}
                          className="h-8 min-w-[7.5rem] flex-1 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                        >
                          <option value="">Select bank</option>
                          {banks.map((bank) => (
                            <option key={bank} value={bank}>
                              {bank}
                            </option>
                          ))}
                        </select>
                        <input
                          value={tender.accountNumber}
                          onChange={(event) => setTenderBank(method, { accountNumber: event.target.value })}
                          placeholder="A/C no. (optional)"
                          aria-label={`${method} account number`}
                          className="h-8 min-w-[8rem] flex-1 rounded-md border border-slate-300 px-2 text-xs outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                        />
                        {showAddBank ? (
                          <>
                            <input
                              value={newBank}
                              data-skip-pay="true"
                              onChange={(event) => setNewBank(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  addBank();
                                }
                              }}
                              placeholder="New bank"
                              aria-label="New bank name"
                              className="h-8 w-24 rounded-md border border-slate-300 px-2 text-xs outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                            />
                            <button type="button" onClick={addBank} className="h-8 shrink-0 text-xs font-semibold text-sky-700 hover:text-sky-900 dark:text-sky-300">
                              + Add Bank
                            </button>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              <div className="flex items-center gap-2 pt-1">
                <input
                  value={newMethod}
                  data-skip-pay="true"
                  onChange={(event) => setNewMethod(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      event.stopPropagation();
                      addPaymentMethod();
                    }
                  }}
                  placeholder="New method"
                  aria-label="New payment method"
                  className="h-8 w-36 rounded-md border border-slate-300 px-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
                <button type="button" onClick={addPaymentMethod} className="h-8 text-xs font-semibold text-emerald-700 hover:text-emerald-900 dark:text-emerald-300">
                  + Add Method
                </button>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-700">
              <dt className="font-semibold text-slate-500">Net Payable Amount</dt>
              <dd className="text-right text-base font-bold tabular-nums text-slate-900 dark:text-slate-50">{money(totals.net)}</dd>
              <dt className="font-semibold text-slate-500">Total Paid</dt>
              <dd className="text-right font-semibold tabular-nums text-slate-900 dark:text-slate-50">{money(totalPaid)}</dd>
              <dt className="font-semibold text-slate-500">Due Amount</dt>
              <dd className={`text-right font-bold tabular-nums ${dueAmount > 0 ? 'text-rose-600' : 'text-slate-900 dark:text-slate-50'}`}>{money(dueAmount)}</dd>
              <dt className="font-semibold text-slate-500">Change/Return Amount</dt>
              <dd className="text-right font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{money(changeAmount)}</dd>
            </dl>
            {payError ? (
              <p role="alert" className="mx-4 mb-3 rounded-md bg-rose-600 px-3 py-2 text-center text-sm font-bold text-white">
                {payError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
              <button type="button" onClick={() => setPayOpen(false)} className="min-h-[48px] touch-manipulation rounded-md bg-slate-200 px-6 text-sm font-semibold text-slate-800">
                Cancel
              </button>
              <button type="button" onClick={confirmPay} className="min-h-[48px] touch-manipulation rounded-md bg-emerald-600 px-8 text-sm font-bold text-white">
                Ok
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {receipt ? <ThermalReceipt sale={receipt} /> : null}
    </AppShell>
  );
}
