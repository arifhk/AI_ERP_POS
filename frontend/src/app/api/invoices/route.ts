import { NextResponse } from 'next/server';

type InvoiceBody = {
  customer?: { id?: string | number | null; name?: string; phone?: string; address?: string };
  items?: unknown[];
  payment?: {
    totalPayable?: number;
    totalPaid?: number;
    returnAmount?: number;
    methods?: { method?: string; amount?: number }[];
  };
  summary?: {
    totalLine?: number;
    totalQty?: number;
    vat?: number;
    totalDiscount?: number;
    netAmount?: number;
  };
};

export async function POST(request: Request) {
  let body: InvoiceBody;
  try {
    body = (await request.json()) as InvoiceBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!Array.isArray(body.items) || body.items.length === 0 || !body.payment || !body.summary) {
    return NextResponse.json({ error: 'Invoice is incomplete' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, invoiceNo: `INV${Date.now().toString().slice(-8)}` }, { status: 201 });
}
