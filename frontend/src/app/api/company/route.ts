import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

function bearer(request: Request) {
  const header = request.headers.get('authorization')?.trim() ?? '';
  return header.toLowerCase().startsWith('bearer ') ? header : '';
}

async function forward(response: Response) {
  const body = await response.text();
  return new NextResponse(body || '{}', {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  });
}

export async function GET(request: Request) {
  const token = bearer(request);
  if (!token) {
    return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 });
  }
  const response = await fetch(`${backendOrigin()}/settings/invoice`, {
    method: 'GET',
    cache: 'no-store',
    headers: { Authorization: token },
  });
  return forward(response);
}

export async function PUT(request: Request) {
  const token = bearer(request);
  if (!token) {
    return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 });
  }
  const payload = await request.text();
  const response = await fetch(`${backendOrigin()}/settings/invoice`, {
    method: 'PUT',
    cache: 'no-store',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: payload || '{}',
  });
  return forward(response);
}
