export const COMPANY_NAME = 'Plus Point Pvt. Ltd.';
export const BRANCH_NAME = 'Joydebpur Branch';

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
