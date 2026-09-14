const COMPANY_NAME = 'Plus Point Pvt. Ltd.';
const BRANCH_NAME = 'Joydebpur Branch';

export const VAT_RATE = 0.05;

export type ReceiptLine = {
  name: string;
  quantity: number;
  price: number;
};

export type Receipt = {
  orderId: number;
  createdAt: string;
  items: ReceiptLine[];
  subtotal: number;
  vat: number;
  grandTotal: number;
  customerPhone?: string | null;
};

export function formatPrice(price: number) {
  return `৳ ${price.toLocaleString('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatReceiptDate(iso: string) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return parsed.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function receiptTotals(items: ReceiptLine[]) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const vat = subtotal * VAT_RATE;
  return { subtotal, vat, grandTotal: subtotal + vat };
}

export function ThermalReceipt({
  receipt,
  printRoot = false,
}: {
  receipt: Receipt;
  printRoot?: boolean;
}) {
  const invoiceNo = `INV-${String(receipt.orderId).padStart(6, '0')}`;

  return (
    <div
      id={printRoot ? 'thermal-receipt' : undefined}
      className="mx-auto box-border w-[80mm] max-w-[80mm] bg-white px-2 py-2 font-mono text-[11px] leading-snug text-black"
    >
      <header className="text-center">
        <p className="text-sm font-bold uppercase leading-tight tracking-wide">{COMPANY_NAME}</p>
        <p className="mt-0.5 text-[10px]">{BRANCH_NAME}</p>
        <p className="mt-1 text-[10px] uppercase tracking-wider">Tax Invoice</p>
      </header>

      <div className="my-2 border-t border-dashed border-black" />

      <div className="space-y-0.5 text-[11px]">
        <div className="flex justify-between gap-2">
          <span>Date</span>
          <span className="text-right">{formatReceiptDate(receipt.createdAt)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Invoice</span>
          <span>{invoiceNo}</span>
        </div>
        {receipt.customerPhone ? (
          <div className="flex justify-between gap-2">
            <span>Customer</span>
            <span>{receipt.customerPhone}</span>
          </div>
        ) : null}
      </div>

      <div className="my-2 border-t border-dashed border-black" />

      <div className="mb-1 flex justify-between text-[10px] font-bold uppercase">
        <span>Item</span>
        <span>Qty / Price</span>
      </div>
      <ul className="space-y-1.5">
        {receipt.items.map((item, index) => (
          <li key={`${item.name}-${index}`}>
            <p className="break-words uppercase">{item.name}</p>
            <div className="flex justify-between gap-2">
              <span>
                {item.quantity} x {formatPrice(item.price)}
              </span>
              <span>{formatPrice(item.price * item.quantity)}</span>
            </div>
          </li>
        ))}
      </ul>

      <div className="my-2 border-t border-dashed border-black" />

      <div className="space-y-0.5">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatPrice(receipt.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>VAT (5%)</span>
          <span>{formatPrice(receipt.vat)}</span>
        </div>
        <div className="mt-1 flex justify-between text-sm font-bold">
          <span>Total</span>
          <span>{formatPrice(receipt.grandTotal)}</span>
        </div>
      </div>

      <div className="my-2 border-t border-dashed border-black" />
      <p className="text-center text-[10px] font-medium">Thank you for shopping with us!</p>
    </div>
  );
}
