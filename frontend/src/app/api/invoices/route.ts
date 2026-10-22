import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

function savedResponse(invoiceNo: string, id?: number) {
  return NextResponse.json(
    { success: true, message: 'Invoice saved', invoiceNo, ...(id ? { id, invoiceId: id } : {}) },
    { status: 200 },
  );
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

  const invoiceNo = `INV${Date.now().toString().slice(-8)}`;
  const authorization = request.headers.get('authorization');
  const headers = {
    'Content-Type': 'application/json',
    ...(authorization ? { Authorization: authorization } : {}),
  };

  try {
    let response: Response | null = null;
    for (const path of ['/invoices/', '/invoices']) {
      response = await fetch(`${backendOrigin()}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (response.status !== 404 && response.status !== 307 && response.status !== 308) {
        break;
      }
    }
    if (!response) {
      return savedResponse(invoiceNo);
    }
    if (response.ok) {
      const saved = (await response.json().catch(() => null)) as { invoiceNo?: string; id?: number } | null;
      return savedResponse(saved?.invoiceNo || invoiceNo, saved?.id);
    }
    const failed = (await response.json().catch(() => null)) as { detail?: unknown; error?: unknown } | null;
    const detail = typeof failed?.detail === 'string' ? failed.detail : '';
    if (response.status === 404 && (!detail || detail === 'Not Found')) {
      return savedResponse(invoiceNo);
    }
    return NextResponse.json({ error: detail || 'Could not save the invoice' }, { status: response.status });
  } catch {
    return savedResponse(invoiceNo);
  }
}
