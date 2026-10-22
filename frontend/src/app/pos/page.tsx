'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { toast } from 'sonner';
import { PosCameraScanner } from '../../components/PosCameraScanner';
import { AddCustomerModal, type NewCustomerForm } from '../../components/pos/AddCustomerModal';
import { RecallInvoiceModal, type HeldInvoice } from '../../components/pos/RecallInvoiceModal';
import { ReprintModal } from '../../components/pos/ReprintModal';
import { SEED as CUSTOMER_SEED, SearchCustomerModal, type PosCustomerRow } from '../../components/pos/SearchCustomerModal';
import { AppShell } from '../../components/AppShell';
import type { CatalogProduct } from '../../components/ProductEditor';
import { API_BASE, authHeaders } from '../../utils/api';
import { decodeJwtPayload } from '../../utils/auth';
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
  previousPoints: number;
  branch: ReceiptBranch;
};

type ReceiptBranch = {
  name: string;
  address: string;
  phone: string;
};

const ACTIVE_BRANCH_KEY = 'pos_active_branch';
const FALLBACK_BRANCH: ReceiptBranch = {
  name: 'Bashundhara City (2)',
  address: 'Shop No= 48,49. Level -3, Block - C, Bashundhara City, Dhaka , Dhaka-0',
  phone: '01958387964',
};

function readStoredBranch(): ReceiptBranch | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(ACTIVE_BRANCH_KEY) || 'null') as Partial<ReceiptBranch> | null;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const name = parsed.name?.trim();
    if (!name) {
      return null;
    }
    return {
      name,
      address: parsed.address?.trim() || 'Address unavailable',
      phone: parsed.phone?.trim() || '—',
    };
  } catch {
    return null;
  }
}

const CATALOG_PAGE = `${API_BASE}/products/table?page=1&page_size=100&status=active`;
const HELD_INVOICES_KEY = 'pos_held_invoices';

function readHeldInvoices(): HeldInvoice[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(HELD_INVOICES_KEY) || '[]') as unknown;
    return Array.isArray(parsed) ? (parsed as HeldInvoice[]) : [];
  } catch {
    return [];
  }
}

function writeHeldInvoices(invoices: HeldInvoice[]) {
  localStorage.setItem(HELD_INVOICES_KEY, JSON.stringify(invoices));
}

function formatHoldTimestamp(date = new Date()) {
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const day = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  return `${time}, ${day}`;
}

function membershipValue(type: string) {
  return /vip/i.test(type) ? 'VIP' : 'Regular';
}

function ageFromDob(value: string) {
  if (!value) {
    return '';
  }
  const dob = new Date(`${value}T00:00:00`);
  if (Number.isNaN(dob.getTime())) {
    return '';
  }
  const today = new Date();
  let years = today.getFullYear() - dob.getFullYear();
  const month = today.getMonth() - dob.getMonth();
  if (month < 0 || (month === 0 && today.getDate() < dob.getDate())) {
    years -= 1;
  }
  if (years < 0 || years > 130) {
    return '';
  }
  return String(years);
}

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

function phoneDigits(value: string) {
  return value.replace(/\D/g, '');
}

function money(amount: number) {
  const [whole, fraction] = Math.abs(amount).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${amount < 0 ? '-' : ''}${grouped}.${fraction}`;
}

function numericInput(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
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

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function cartProductId(id: string) {
  const raw = /^(?:p|v)-(.+)$/.exec(id)?.[1] ?? id;
  const numeric = Number(raw);
  return Number.isInteger(numeric) ? numeric : raw;
}

function paymentLabel(payment: SaleReceipt['payments'][number]) {
  return payment.bankName ? `${payment.method} - ${payment.bankName}` : payment.method;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function integerWords(value: number): string {
  if (value < 20) {
    return ONES[value] || 'Zero';
  }
  if (value < 100) {
    return `${TENS[Math.floor(value / 10)]}${value % 10 ? ` ${ONES[value % 10]}` : ''}`;
  }
  if (value < 1000) {
    return `${ONES[Math.floor(value / 100)]} Hundred${value % 100 ? ` ${integerWords(value % 100)}` : ''}`;
  }
  if (value < 100000) {
    return `${integerWords(Math.floor(value / 1000))} Thousand${value % 1000 ? ` ${integerWords(value % 1000)}` : ''}`;
  }
  if (value < 10000000) {
    return `${integerWords(Math.floor(value / 100000))} Lakh${value % 100000 ? ` ${integerWords(value % 100000)}` : ''}`;
  }
  return `${integerWords(Math.floor(value / 10000000))} Crore${value % 10000000 ? ` ${integerWords(value % 10000000)}` : ''}`;
}

function amountInWords(amount: number) {
  const taka = Math.floor(Math.abs(amount));
  const paisa = Math.round((Math.abs(amount) - taka) * 100) % 100;
  const takaWords = taka === 0 ? 'Zero' : integerWords(taka);
  const paisaWords = paisa > 0 ? ` and ${integerWords(paisa)} Paisa` : '';
  return `${takaWords} Taka${paisaWords} Only`;
}

function ReceiptBarcode({ value }: { value: string }) {
  const bits = value.split('').flatMap((char) => char.charCodeAt(0).toString(2).padStart(7, '0').split(''));
  return (
    <svg viewBox={`0 0 ${bits.length + 8} 42`} className="mx-auto mt-1 h-10 w-[70mm]" role="img" aria-label={`Barcode ${value}`}>
      <rect width="100%" height="100%" fill="white" />
      {bits.map((bit, index) => (bit === '1' ? <rect key={index} x={index + 4} y="0" width="1" height="32" fill="black" /> : null))}
      <text x={(bits.length + 8) / 2} y="40" textAnchor="middle" fontSize="8" fill="black">
        {value}
      </text>
    </svg>
  );
}

function ThermalReceipt({ sale }: { sale: SaleReceipt }) {
  const printDate = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const itemQty = sale.lines.reduce((sum, line) => sum + line.qty, 0);
  const itemAmount = sale.lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const previousPoint = sale.previousPoints || 0;
  const redeemPoint = 0;
  const earnedPoint = Math.floor(Math.max(0, sale.net) / 100);
  const currentPoint = previousPoint - redeemPoint + earnedPoint;
  const payments = sale.payments.filter((payment) => payment.amount > 0);
  return (
    <article className="mx-auto w-[80mm] bg-white px-1 py-1 font-mono text-[10px] leading-tight text-black">
      <header className="text-center">
        <p className="bg-black py-1 text-sm font-bold tracking-wide text-white [print-color-adjust:exact]">Plus Point</p>
        <p className="mt-1 text-xs">{sale.branch?.name || FALLBACK_BRANCH.name}</p>
        <p>{sale.branch?.address || FALLBACK_BRANCH.address}</p>
        <p>{sale.branch?.phone || FALLBACK_BRANCH.phone}</p>
      </header>

      <div className="mt-1 border border-black py-0.5 text-center text-xs font-bold">MUSHAK: 6.3</div>

      <div className="mt-1 grid grid-cols-2 gap-x-2">
        <p>Invoice No: {sale.invoiceNo}</p>
        <p>Invoice Date: {sale.issuedAt}</p>
        <p>Print Date: {printDate}</p>
        <div>
          <p>VAT Reg.: —</p>
          <p className="font-bold">DUPLICATE-</p>
        </div>
      </div>

      <div className="mt-1 grid grid-cols-2 gap-x-2 border-t border-black pt-1">
        <p>Name: {sale.customer.name || 'Walk-in'}</p>
        <p>Address: {sale.customer.address || '—'}</p>
        <p>Mobile: {sale.customer.phone || '—'}</p>
        <p>Served by: samad</p>
      </div>

      <table className="mt-1 w-full border-collapse text-left">
        <thead>
          <tr className="border-y border-black">
            <th className="py-0.5 pr-0.5 font-semibold">SL</th>
            <th className="py-0.5 pr-0.5 font-semibold">Description</th>
            <th className="py-0.5 text-right font-semibold">Sqty</th>
            <th className="py-0.5 text-right font-semibold">MRP</th>
            <th className="py-0.5 text-right font-semibold">D Amt</th>
            <th className="py-0.5 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {sale.lines.map((line, index) => (
            <tr key={line.id} className="align-top">
              <td className="py-0.5 pr-0.5 tabular-nums">{index + 1}</td>
              <td className="py-0.5 pr-0.5">{line.name}</td>
              <td className="py-0.5 text-right tabular-nums">{line.qty}</td>
              <td className="py-0.5 text-right tabular-nums">{money(line.price)}</td>
              <td className="py-0.5 text-right tabular-nums">{money(lineDiscount(line))}</td>
              <td className="py-0.5 text-right tabular-nums">{money(lineTotal(line))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid grid-cols-[1.4rem_1fr_2rem_1fr] gap-1 border-y border-black bg-gray-200 px-0.5 py-0.5 font-bold [print-color-adjust:exact]">
        <span />
        <span>Sub Total:</span>
        <span className="text-right tabular-nums">{itemQty}</span>
        <span className="text-right tabular-nums">{money(itemAmount)}</span>
      </div>

      <div className="ml-auto mt-1 w-[48mm] space-y-0.5">
        <div className="flex justify-between"><span>Discount</span><span className="tabular-nums">{money(sale.discount)}</span></div>
        <div className="flex justify-between"><span>VAT</span><span className="tabular-nums">{money(sale.vat)}</span></div>
        <div className="flex justify-between font-bold"><span>Net Amount</span><span className="tabular-nums">{money(sale.net)}</span></div>
        <div className="flex justify-between"><span>Paid Amount</span><span className="tabular-nums">{money(sale.paid)}</span></div>
        <div className="flex justify-between"><span>Change Amount</span><span className="tabular-nums">{money(sale.change)}</span></div>
      </div>
      <p className="mt-1">Inword: {amountInWords(sale.net)}</p>

      <table className="mt-1 w-full border-collapse border border-black">
        <thead>
          <tr className="border-b border-black">
            <th className="px-1 py-0.5 text-left font-semibold">DESCRIPTION</th>
            <th className="px-1 py-0.5 text-right font-semibold">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          {payments.length > 0 ? (
            payments.map((payment) => (
              <tr key={`${payment.method}-${payment.bankName ?? ''}`}>
                <td className="border-t border-black px-1 py-0.5">{paymentLabel(payment)}</td>
                <td className="border-t border-black px-1 py-0.5 text-right tabular-nums">{money(payment.amount)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="px-1 py-0.5">CREDIT SALE</td>
              <td className="px-1 py-0.5 text-right tabular-nums">{money(sale.net)}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="mt-1 border border-black p-1">
        <div className="flex justify-between"><span>Previous Point</span><span className="tabular-nums">{previousPoint}</span></div>
        <div className="flex justify-between"><span>Redeem Point</span><span className="tabular-nums">{redeemPoint}</span></div>
        <div className="flex justify-between"><span>Earned Point</span><span className="tabular-nums">{earnedPoint}</span></div>
        <div className="flex justify-between font-bold"><span>Curent Point</span><span className="tabular-nums">{currentPoint}</span></div>
      </div>

      <ReceiptBarcode value={sale.invoiceNo} />

      <footer className="mt-1 text-center">
        <p>{sale.branch?.phone || FALLBACK_BRANCH.phone} · www.pluspoint.com.bd</p>
        <ul className="mt-1 list-disc pl-4 text-left">
          <li>Exchanges within 10 days.</li>
          <li>No cash refunds.</li>
          <li>Original tag is required.</li>
          <li>No exchange on accessories or discounted items.</li>
        </ul>
        <p className="mt-1">System By: Mediasoft Data Systems Ltd. T: 55014045</p>
      </footer>
    </article>
  );
}

export default function PosPage() {
  const [scanCode, setScanCode] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [heldInvoices, setHeldInvoices] = useState<HeldInvoice[]>([]);
  const [isRecallOpen, setIsRecallOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerCode, setCustomerCode] = useState('');
  const [customerId, setCustomerId] = useState<string | number | null>(null);
  const [directory, setDirectory] = useState<PosCustomerRow[]>(() => CUSTOMER_SEED.map((row) => ({ ...row })));
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [isSearchCustomerOpen, setIsSearchCustomerOpen] = useState(false);
  const [isReprintOpen, setIsReprintOpen] = useState(false);
  const [previousDue, setPreviousDue] = useState(0);
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [customerEmail, setCustomerEmail] = useState('');
  const [membership, setMembership] = useState('Regular');
  const [isExistingCustomer, setIsExistingCustomer] = useState(false);
  const [gender, setGender] = useState('Select');
  const [dob, setDob] = useState('');
  const [age, setAge] = useState('');
  const [activeBranch, setActiveBranch] = useState<ReceiptBranch>(FALLBACK_BRANCH);
  const [discountPercent, setDiscountPercent] = useState('0');
  const [flatDiscountAmount, setFlatDiscountAmount] = useState('0.00');
  const [returnAmount, setReturnAmount] = useState(0);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const customerNameRef = useRef<HTMLInputElement>(null);
  const resolvedPhoneRef = useRef('');
  const latestIdRef = useRef<string | null>(null);
  const tenderRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const printResetRef = useRef(false);
  const savingRef = useRef(false);
  const resetPOSRef = useRef<() => void>(() => {});
  const [payOpen, setPayOpen] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState(['Cash', 'BKASH', 'NAGAD', 'Card']);
  const [banks, setBanks] = useState(['City Bank', 'Brac Bank', 'DBBL']);
  const [newMethod, setNewMethod] = useState('');
  const [newBank, setNewBank] = useState('');
  const [tenders, setTenders] = useState<TenderState>(() => blankTenders(DEFAULT_PAYMENT_METHODS));
  const [payError, setPayError] = useState<string | null>(null);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const paymentMethodsRef = useRef(paymentMethods);
  paymentMethodsRef.current = paymentMethods;
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);
  const [clock, setClock] = useState('11 Oct 2026');
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const { data: firstPage, error: catalogError } = useApi<ProductTable>(CATALOG_PAGE);

  useEffect(() => {
    setHeldInvoices(readHeldInvoices());
  }, []);

  useEffect(() => {
    const cached = readStoredBranch();
    if (cached) {
      setActiveBranch(cached);
    }
    let cancelled = false;
    void (async () => {
      try {
        const token = localStorage.getItem('token') ?? '';
        const payload = decodeJwtPayload(token);
        const branchId = Number(payload.branch_id);
        const branches = await fetchJson<Array<{ id: number; name?: string | null; address?: string | null; phone?: string | null; is_active?: boolean }>>(
          `${API_BASE}/branches/?limit=200`,
        );
        const match =
          branches.find((branch) => Number.isFinite(branchId) && branch.id === branchId) ??
          branches.find((branch) => branch.is_active !== false) ??
          branches[0];
        if (!match || cancelled) {
          return;
        }
        const next: ReceiptBranch = {
          name: match.name?.trim() || FALLBACK_BRANCH.name,
          address: match.address?.trim() || 'Address unavailable',
          phone: match.phone?.trim() || '—',
        };
        setActiveBranch(next);
        localStorage.setItem(ACTIVE_BRANCH_KEY, JSON.stringify(next));
      } catch {
        if (!cancelled && !cached) {
          setActiveBranch(FALLBACK_BRANCH);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const years = ageFromDob(dob);
    if (years) {
      setAge(years);
    }
  }, [dob]);

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
    const subTotal = Math.max(0, total + sd + vat - totalLineDiscount - returnAmount);
    const calculatedPercentDiscount = (subTotal * numericInput(discountPercent)) / 100;
    const flatDiscount = numericInput(flatDiscountAmount);
    const finalTotalDiscount = calculatedPercentDiscount + flatDiscount;
    const net = Math.max(0, subTotal - finalTotalDiscount);
    return {
      lines: cart.length,
      qty,
      total,
      sd,
      vat,
      discount: totalLineDiscount + Math.min(subTotal, finalTotalDiscount),
      returnAmount,
      subTotal,
      net,
    };
  }, [cart, discountPercent, flatDiscountAmount, returnAmount]);

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

  function resolveCustomer(phone: string) {
    const trimmed = phone.trim();
    const needle = phoneDigits(trimmed);
    if (!needle) {
      return;
    }
    if (resolvedPhoneRef.current === needle) {
      return;
    }
    resolvedPhoneRef.current = needle;
    const match = directory.find((row) => phoneDigits(row.phone) === needle);
    if (match) {
      setCustomerId(match.id);
      setCustomerCode(match.id);
      setCustomerName(match.firstName);
      setCustomerAddress(match.address);
      setPreviousDue(match.previousDue || 0);
      setLoyaltyPoints(match.loyaltyPoints || 0);
      setCustomerEmail(match.email || '');
      setMembership(membershipValue(match.type));
      setGender(match.gender || 'Select');
      setDob(match.dob || '');
      setAge(match.age || ageFromDob(match.dob || ''));
      setIsExistingCustomer(true);
      focusBarcode();
      return;
    }
    const id = `C-${trimmed.slice(-4)}${Math.floor(Math.random() * 100)}`;
    const created: PosCustomerRow = {
      id,
      firstName: '',
      phone: trimmed,
      type: 'Regular',
      discount: 0,
      doe: '',
      address: '',
      email: '',
      previousDue: 0,
      loyaltyPoints: 0,
      gender: 'Select',
      dob: '',
      age: '',
    };
    setDirectory((current) => [created, ...current.filter((row) => phoneDigits(row.phone) !== needle)]);
    setCustomerId(id);
    setCustomerCode(id);
    setCustomerName('');
    setCustomerAddress('');
    setPreviousDue(0);
    setLoyaltyPoints(0);
    setCustomerEmail('');
    setMembership('Regular');
    setGender('Select');
    setDob('');
    setAge('');
    setIsExistingCustomer(false);
    window.setTimeout(() => customerNameRef.current?.focus(), 0);
  }

  function rememberCustomer(patch: Partial<Pick<PosCustomerRow, 'firstName' | 'address' | 'email' | 'type' | 'gender' | 'dob' | 'age'>>) {
    if (!customerCode) {
      return;
    }
    setDirectory((current) => current.map((row) => (row.id === customerCode ? { ...row, ...patch } : row)));
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

  function clearActiveSale() {
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
    resolvedPhoneRef.current = '';
    setPreviousDue(0);
    setLoyaltyPoints(0);
    setCustomerEmail('');
    setMembership('Regular');
    setGender('Select');
    setDob('');
    setAge('');
    setIsExistingCustomer(false);
    setDiscountPercent('0');
    setFlatDiscountAmount('0.00');
    setReturnAmount(0);
    focusBarcode();
  }

  function holdInvoice() {
    if (cart.length === 0) {
      return;
    }
    const entry: HeldInvoice = {
      id: `H${Date.now()}`,
      timestamp: formatHoldTimestamp(),
      itemCount: cart.reduce((sum, line) => sum + line.qty, 0),
      totalAmount: totals.net,
      cart: cart.map((line) => ({ ...line })),
      customer: {
        id: customerId,
        code: customerCode,
        name: customerName,
        phone: customerMobile,
        address: customerAddress,
      },
      orderDiscountPercent: discountPercent,
      orderDiscountAmount: flatDiscountAmount,
      returnAmount,
    };
    const next = [entry, ...heldInvoices];
    setHeldInvoices(next);
    writeHeldInvoices(next);
    clearActiveSale();
    setStatus(null);
    toast.success('Invoice Held Successfully');
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
    resolvedPhoneRef.current = '';
    setPreviousDue(0);
    setLoyaltyPoints(0);
    setCustomerEmail('');
    setMembership('Regular');
    setGender('Select');
    setDob('');
    setAge('');
    setIsExistingCustomer(false);
    setDiscountPercent('0');
    setFlatDiscountAmount('0.00');
    setReturnAmount(0);
    setStatus('Invoice cancelled.');
    setPayOpen(false);
    focusBarcode();
  }

  function onDiscountPercentChange(value: string) {
    setDiscountPercent(value);
  }

  function onDiscountAmountChange(value: string) {
    setFlatDiscountAmount(value);
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

  function resetPOS() {
    printResetRef.current = false;
    latestIdRef.current = null;
    setCart([]);
    setSelectedId(null);
    setScanCode('');
    setScanNotice(null);
    setStatus(null);
    setCustomerMobile('');
    setCustomerName('');
    setCustomerAddress('');
    setCustomerCode('');
    setCustomerId(null);
    resolvedPhoneRef.current = '';
    setPreviousDue(0);
    setLoyaltyPoints(0);
    setCustomerEmail('');
    setMembership('Regular');
    setGender('Select');
    setDob('');
    setAge('');
    setIsExistingCustomer(false);
    setDiscountPercent('0');
    setFlatDiscountAmount('0.00');
    setReturnAmount(0);
    setPayError(null);
    setNewMethod('');
    setNewBank('');
    setTenders(blankTenders(paymentMethodsRef.current));
    setPayOpen(false);
    setReceipt(null);
    focusBarcode();
  }

  async function saveInvoice() {
    if (savingRef.current) {
      return;
    }
    const paid = tenderTotal(tenders, paymentMethods);
    const shortfall = roundMoney(totals.net - paid);
    if (shortfall > 0) {
      setPayError(`Payment Incomplete! Due Amount: ${money(shortfall)} TK`);
      return;
    }
    const methods = paymentMethods.flatMap((method) => {
      const tender = tenders[method];
      if (!tender?.on || !(Number(tender.amount) > 0)) {
        return [];
      }
      const card = isCardMethod(method);
      return [
        {
          method,
          amount: roundMoney(Number(tender.amount)),
          ...(card && tender.bankName ? { bankName: tender.bankName } : {}),
          ...(card && tender.accountNumber.trim() ? { accountNumber: tender.accountNumber.trim() } : {}),
        },
      ];
    });
    const change = Math.max(0, roundMoney(paid - totals.net));
    const payload = {
      customer: {
        id: currentOrder.customer.id,
        name: currentOrder.customer.name,
        phone: currentOrder.customer.phone,
        address: currentOrder.customer.address,
      },
      items: cart.map((line) => ({
        productId: cartProductId(line.id),
        barcode: line.barcode,
        qty: line.qty,
        unitPrice: roundMoney(line.price),
        discount: roundMoney(lineDiscount(line)),
        subtotal: roundMoney(lineGross(line) - lineDiscount(line)),
      })),
      payment: {
        totalPayable: roundMoney(totals.net),
        totalPaid: roundMoney(paid),
        returnAmount: change,
        methods,
      },
      summary: {
        totalLine: totals.lines,
        totalQty: totals.qty,
        vat: roundMoney(totals.vat),
        totalDiscount: roundMoney(totals.discount),
        netAmount: roundMoney(totals.net),
      },
    };
    savingRef.current = true;
    setSavingInvoice(true);
    setPayError(null);
    try {
      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const failed = (await response.json().catch(() => null)) as { detail?: unknown; error?: unknown } | null;
        const detail = typeof failed?.detail === 'string' ? failed.detail : '';
        const error = typeof failed?.error === 'string' ? failed.error : '';
        throw new Error(detail || error || `Invoice save failed (${response.status})`);
      }
      const saved = (await response.json()) as { invoiceNo?: string };
      const invoiceNo = saved.invoiceNo || `INV${Date.now().toString().slice(-8)}`;
      const who = currentOrder.customer.name || currentOrder.customer.phone || 'Walk-in';
      toast.success('Invoice saved');
      printResetRef.current = true;
      flushSync(() => {
        setStatus(`Paid ${money(totals.net)} · ${methods.map((payment) => payment.method).join(', ') || 'Cash'} · ${who}`);
        setPayOpen(false);
        setReceipt({
          invoiceNo,
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
          discountPercent: discountPercent,
          discount: totals.discount,
          returnAmount: totals.returnAmount,
          subTotal: totals.subTotal,
          net: totals.net,
          payments: methods,
          paid,
          change,
          previousPoints: loyaltyPoints,
          branch: activeBranch,
        });
      });
      window.setTimeout(() => window.print(), 50);
    } catch (error) {
      printResetRef.current = false;
      const message = error instanceof Error ? error.message : 'Could not save the invoice.';
      setPayError(message);
      toast.error(message);
    } finally {
      savingRef.current = false;
      setSavingInvoice(false);
    }
  }

  function applyCustomer(row: PosCustomerRow, existing = true) {
    setCustomerCode(row.id);
    setCustomerId(row.id);
    setCustomerName(row.firstName);
    setCustomerMobile(row.phone);
    setCustomerAddress(row.address);
    setPreviousDue(row.previousDue || 0);
    setLoyaltyPoints(row.loyaltyPoints || 0);
    setCustomerEmail(row.email || '');
    setMembership(membershipValue(row.type));
    setGender(row.gender || 'Select');
    setDob(row.dob || '');
    setAge(row.age || ageFromDob(row.dob || ''));
    setIsExistingCustomer(existing);
    resolvedPhoneRef.current = phoneDigits(row.phone);
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
      email: form.email.trim(),
      previousDue: 0,
      loyaltyPoints: 0,
      gender: form.gender || 'Select',
      dob: form.dateOfBirth || '',
      age: ageFromDob(form.dateOfBirth || ''),
    };
    setDirectory((current) => [row, ...current.filter((item) => item.id !== row.id)]);
    const name = [form.firstName, form.middleName, form.lastName].map((part) => part.trim()).filter(Boolean).join(' ');
    applyCustomer({ ...row, firstName: name || row.firstName }, false);
  }

  function exchangeItem() {
    console.log('Exchange');
    setStatus('Exchange started.');
  }

  function recallInvoice() {
    setHeldInvoices(readHeldInvoices());
    setIsRecallOpen(true);
  }

  function restoreHeldInvoice(invoice: HeldInvoice) {
    const next = heldInvoices.filter((item) => item.id !== invoice.id);
    setHeldInvoices(next);
    writeHeldInvoices(next);
    const customer = invoice.customer ?? { id: null, code: '', name: '', phone: '', address: '' };
    setCart(invoice.cart.map((line) => ({ ...line })));
    setSelectedId(invoice.cart[invoice.cart.length - 1]?.id ?? null);
    latestIdRef.current = invoice.cart[invoice.cart.length - 1]?.id ?? null;
    setCustomerId(customer.id);
    setCustomerCode(customer.code);
    setCustomerName(customer.name);
    setCustomerMobile(customer.phone);
    setCustomerAddress(customer.address);
    const saved = directory.find((row) => phoneDigits(row.phone) === phoneDigits(customer.phone));
    setPreviousDue(saved?.previousDue || 0);
    setLoyaltyPoints(saved?.loyaltyPoints || 0);
    setCustomerEmail(saved?.email || '');
    setMembership(membershipValue(saved?.type || 'Regular'));
    setGender(saved?.gender || 'Select');
    setDob(saved?.dob || '');
    setAge(saved?.age || ageFromDob(saved?.dob || ''));
    setIsExistingCustomer(Boolean(saved));
    resolvedPhoneRef.current = phoneDigits(customer.phone);
    setDiscountPercent(invoice.orderDiscountPercent || '0');
    setFlatDiscountAmount(invoice.orderDiscountAmount || '0.00');
    setReturnAmount(invoice.returnAmount || 0);
    setIsRecallOpen(false);
    setStatus(null);
    focusBarcode();
  }

  function deleteHeldInvoice(id: string) {
    const next = heldInvoices.filter((invoice) => invoice.id !== id);
    setHeldInvoices(next);
    writeHeldInvoices(next);
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

  resetPOSRef.current = resetPOS;

  useEffect(() => {
    function onAfterPrint() {
      if (!printResetRef.current) {
        return;
      }
      resetPOSRef.current();
    }
    window.addEventListener('afterprint', onAfterPrint);
    return () => window.removeEventListener('afterprint', onAfterPrint);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (payOpen || cameraOpen || isAddCustomerOpen || isSearchCustomerOpen || isReprintOpen || isRecallOpen) {
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

  const customerDetailClass = isExistingCustomer
    ? 'mt-1 min-h-[44px] w-full cursor-not-allowed rounded-md border border-transparent bg-gray-100 px-3 text-sm font-semibold text-gray-500 outline-none disabled:cursor-not-allowed disabled:border-transparent disabled:bg-gray-100 disabled:text-gray-500'
    : 'mt-1 min-h-[44px] w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-500/30';

  return (
    <>
    <div className="no-print">
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
              <div className="space-y-2">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-xs font-semibold text-slate-500">
                  Mobile No
                  <span className="mt-1 flex gap-1">
                    <input
                      value={customerMobile}
                      onChange={(event) => {
                        setCustomerMobile(event.target.value);
                        resolvedPhoneRef.current = '';
                        setCustomerId(null);
                        setCustomerCode('');
                        setCustomerName('');
                        setCustomerAddress('');
                        setPreviousDue(0);
                        setLoyaltyPoints(0);
                        setCustomerEmail('');
                        setMembership('Regular');
                        setGender('Select');
                        setDob('');
                        setAge('');
                        setIsExistingCustomer(false);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          resolveCustomer(event.currentTarget.value);
                        }
                      }}
                      onBlur={(event) => {
                        const next = event.relatedTarget;
                        if (next instanceof HTMLElement && next.dataset.customerAction) {
                          return;
                        }
                        resolveCustomer(event.currentTarget.value);
                      }}
                      placeholder="01XXXXXXXXX"
                      inputMode="tel"
                      className="min-h-[44px] min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      aria-label="Add Customer"
                      data-customer-action="add"
                      onClick={() => {
                        setIsExistingCustomer(false);
                        setIsAddCustomerOpen(true);
                      }}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md bg-emerald-600 text-xl font-bold text-white"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      aria-label="Search customer"
                      data-customer-action="search"
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
                  Customer Id
                  <input
                    readOnly
                    tabIndex={-1}
                    value={customerCode}
                    className="mt-1 min-h-[44px] w-full cursor-not-allowed rounded-md border border-transparent bg-gray-100 px-3 text-sm font-semibold text-gray-500 outline-none"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  Name
                  <input
                    id="pos-customer-name"
                    ref={customerNameRef}
                    readOnly={isExistingCustomer}
                    tabIndex={isExistingCustomer ? -1 : undefined}
                    value={customerName}
                    onChange={(event) => {
                      const name = event.target.value;
                      setCustomerName(name);
                      rememberCustomer({ firstName: name });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        focusBarcode();
                      }
                    }}
                    placeholder="Walk-in"
                    className={customerDetailClass}
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  Address
                  <input
                    readOnly={isExistingCustomer}
                    tabIndex={isExistingCustomer ? -1 : undefined}
                    value={customerAddress}
                    onChange={(event) => {
                      const address = event.target.value;
                      setCustomerAddress(address);
                      rememberCustomer({ address });
                    }}
                    className={customerDetailClass}
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-xs font-semibold text-slate-500">
                  Previous Due
                  <input
                    readOnly
                    tabIndex={-1}
                    value={money(previousDue)}
                    className="mt-1 min-h-[44px] w-full cursor-not-allowed rounded-md border border-transparent bg-gray-100 px-3 text-sm font-semibold text-gray-500 outline-none"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  Loyalty Points
                  <input
                    readOnly
                    tabIndex={-1}
                    value={String(loyaltyPoints)}
                    className="mt-1 min-h-[44px] w-full cursor-not-allowed rounded-md border border-transparent bg-gray-100 px-3 text-sm font-semibold text-gray-500 outline-none"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  Email
                  <input
                    type="email"
                    readOnly={isExistingCustomer}
                    tabIndex={isExistingCustomer ? -1 : undefined}
                    value={customerEmail}
                    onChange={(event) => {
                      const email = event.target.value;
                      setCustomerEmail(email);
                      rememberCustomer({ email });
                    }}
                    placeholder="name@email.com"
                    className={customerDetailClass}
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  Membership
                  <select
                    value={membership}
                    disabled={isExistingCustomer}
                    aria-readonly={isExistingCustomer}
                    onChange={(event) => {
                      const type = event.target.value;
                      setMembership(type);
                      rememberCustomer({ type });
                    }}
                    className={customerDetailClass}
                  >
                    <option value="Regular">Regular</option>
                    <option value="VIP">VIP</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-xs font-semibold text-slate-500">
                  Gender
                  <select
                    value={gender}
                    disabled={isExistingCustomer}
                    aria-readonly={isExistingCustomer}
                    onChange={(event) => {
                      const value = event.target.value;
                      setGender(value);
                      rememberCustomer({ gender: value });
                    }}
                    className={customerDetailClass}
                  >
                    <option value="Select">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  Date of Birth
                  <input
                    type="date"
                    readOnly={isExistingCustomer}
                    tabIndex={isExistingCustomer ? -1 : undefined}
                    value={dob}
                    onChange={(event) => {
                      const value = event.target.value;
                      setDob(value);
                      const years = ageFromDob(value);
                      if (years) {
                        setAge(years);
                      }
                      rememberCustomer({ dob: value, ...(years ? { age: years } : {}) });
                    }}
                    className={customerDetailClass}
                  />
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  Age
                  <input
                    inputMode="numeric"
                    readOnly={isExistingCustomer}
                    tabIndex={isExistingCustomer ? -1 : undefined}
                    value={age}
                    onChange={(event) => {
                      const value = event.target.value.replace(/[^\d]/g, '');
                      setAge(value);
                      rememberCustomer({ age: value });
                    }}
                    placeholder="Years"
                    className={customerDetailClass}
                  />
                </label>
              </div>
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

            {heldInvoices.length > 0 ? (
              <p className="text-xs font-medium text-amber-700">
                {heldInvoices.length} invoice{heldInvoices.length === 1 ? '' : 's'} on hold. Press F7 to recall.
              </p>
            ) : null}
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
                  <input readOnly tabIndex={-1} value={value} className="h-7 w-28 cursor-not-allowed rounded border border-transparent bg-gray-100 px-2 text-right text-xs font-semibold tabular-nums text-gray-500 outline-none" />
                </label>
              ))}
              <label className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                <span>Discount (%)</span>
                <input
                  value={discountPercent}
                  onChange={(event) => onDiscountPercentChange(event.target.value)}
                  inputMode="decimal"
                  className="h-7 w-28 rounded border border-blue-400 bg-white px-2 text-right text-xs font-semibold tabular-nums text-black outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                <span>Discount (Amount)</span>
                <input
                  value={flatDiscountAmount}
                  onChange={(event) => onDiscountAmountChange(event.target.value)}
                  inputMode="decimal"
                  className="h-7 w-28 rounded border border-blue-400 bg-white px-2 text-right text-xs font-semibold tabular-nums text-black outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                <span>Return Amount</span>
                <input readOnly tabIndex={-1} value={money(totals.returnAmount)} className="h-7 w-28 cursor-not-allowed rounded border border-transparent bg-gray-100 px-2 text-right text-xs font-semibold tabular-nums text-gray-500 outline-none" />
              </label>
              <label className="flex items-center justify-between gap-2 text-[11px] font-bold text-gray-800">
                <span>Sub Total</span>
                <input readOnly tabIndex={-1} value={money(totals.subTotal)} className="h-7 w-28 cursor-not-allowed rounded border border-transparent bg-gray-100 px-2 text-right text-xs font-bold tabular-nums text-gray-800 outline-none" />
              </label>
            </div>

            <div>
              <p className="text-3xl font-extrabold uppercase tracking-wide text-blue-700">Net Amount</p>
              <p className="text-3xl font-extrabold tabular-nums text-blue-700">{money(totals.net)}</p>
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
      {isRecallOpen ? (
        <RecallInvoiceModal
          invoices={heldInvoices}
          onClose={() => setIsRecallOpen(false)}
          onRestore={restoreHeldInvoice}
          onDelete={deleteHeldInvoice}
        />
      ) : null}

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
              void saveInvoice();
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
              <button type="button" onClick={() => void saveInvoice()} disabled={savingInvoice} className="min-h-[48px] touch-manipulation rounded-md bg-emerald-600 px-8 text-sm font-bold text-white disabled:opacity-60">
                {savingInvoice ? 'Saving...' : 'Ok'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
    </div>
    {receipt
      ? createPortal(
          <div className="print-only">
            <ThermalReceipt sale={receipt} />
          </div>,
          document.body,
        )
      : null}
    </>
  );
}
