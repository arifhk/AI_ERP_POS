import {
  BRANCH_NAME,
  COMPANY_NAME,
  formatPrice,
  formatReceiptDate,
  type Receipt,
} from './ThermalReceipt';

export function LaserInvoice({
  receipt,
  printRoot = false,
}: {
  receipt: Receipt;
  printRoot?: boolean;
}) {
  const invoiceNo = `INV-${String(receipt.orderId).padStart(6, '0')}`;

  return (
    <article
      id={printRoot ? 'laser-invoice' : undefined}
      className="box-border w-[210mm] max-w-full bg-white px-10 py-8 text-[13px] leading-normal text-black"
    >
      <header className="flex items-start justify-between gap-6 border-b border-black pb-4">
        <div>
          <p className="text-xl font-bold uppercase tracking-wide">{COMPANY_NAME}</p>
          <p className="mt-1 text-sm">{BRANCH_NAME}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold uppercase tracking-widest">Tax Invoice</p>
          <p className="mt-1 font-mono text-sm">{invoiceNo}</p>
        </div>
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="font-semibold">Date</dt>
          <dd>{formatReceiptDate(receipt.createdAt)}</dd>
        </div>
        <div className="flex justify-end gap-2">
          <dt className="font-semibold">Customer</dt>
          <dd>{receipt.customerPhone?.trim() ? receipt.customerPhone : 'Walk-in'}</dd>
        </div>
      </dl>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="py-2 pr-3 font-semibold">#</th>
            <th className="py-2 pr-3 font-semibold">Item</th>
            <th className="py-2 pr-3 text-right font-semibold">Qty</th>
            <th className="py-2 pr-3 text-right font-semibold">Unit price</th>
            <th className="py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {receipt.items.map((item, index) => (
            <tr key={`${item.name}-${index}`} className="border-b border-neutral-300">
              <td className="py-2 pr-3 align-top">{index + 1}</td>
              <td className="py-2 pr-3 align-top">{item.name}</td>
              <td className="py-2 pr-3 text-right align-top">{item.quantity}</td>
              <td className="py-2 pr-3 text-right align-top">{formatPrice(item.price)}</td>
              <td className="py-2 text-right align-top">{formatPrice(item.price * item.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 ml-auto w-64 space-y-1 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatPrice(receipt.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>VAT (5%)</span>
          <span>{formatPrice(receipt.vat)}</span>
        </div>
        <div className="flex justify-between border-t border-black pt-2 text-base font-bold">
          <span>Total</span>
          <span>{formatPrice(receipt.grandTotal)}</span>
        </div>
      </div>

      <p className="mt-10 text-center text-sm">Thank you for shopping with us!</p>
    </article>
  );
}
