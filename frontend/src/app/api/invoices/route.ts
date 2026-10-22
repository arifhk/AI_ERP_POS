import { NextResponse } from 'next/server';

type InvoiceItem = {
  productId?: string | number | null;
  barcode?: string;
  qty?: number;
  unitPrice?: number;
  discount?: number;
  subtotal?: number;
};

type InvoiceBody = {
  customer?: { id?: string | number | null; name?: string; phone?: string; address?: string };
  items?: InvoiceItem[];
  payment?: {
    totalPayable?: number;
    totalPaid?: number;
    returnAmount?: number;
    methods?: { method?: string; amount?: number; bankName?: string; accountNumber?: string }[];
  };
  summary?: {
    totalLine?: number;
    totalQty?: number;
    vat?: number;
    totalDiscount?: number;
    netAmount?: number;
  };
};

function backendOrigin() {
  const configured = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
  if (configured && !configured.includes('vercel.app')) {
    return configured;
  }
  if (process.env.NODE_ENV === 'production') {
    return 'https://ai-erp-pos-api.onrender.com';
  }
  return 'http://127.0.0.1:8000';
}

export async function POST(request: Request) {
  let body: InvoiceBody;
  try {
    body = (await request.json()) as InvoiceBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.customer || !Array.isArray(body.items) || body.items.length === 0 || !body.payment || !body.summary) {
    return NextResponse.json({ error: 'Invoice is incomplete' }, { status: 400 });
  }

  try {
    const authorization = request.headers.get('authorization');
    const response = await fetch(`${backendOrigin()}/invoices/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({ error: 'Could not save the invoice' }));
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json({ error: 'Could not save the invoice' }, { status: 502 });
  }
}
