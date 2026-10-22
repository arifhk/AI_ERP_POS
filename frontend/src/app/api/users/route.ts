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

function authHeader(request: Request) {
  return request.headers.get('authorization') ?? '';
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
  const incoming = new URL(request.url);
  const limit = incoming.searchParams.get('limit') ?? '200';
  const skip = incoming.searchParams.get('skip') ?? '0';
  const response = await fetch(`${backendOrigin()}/users/?limit=${encodeURIComponent(limit)}&skip=${encodeURIComponent(skip)}`, {
    method: 'GET',
    cache: 'no-store',
    headers: { Authorization: authHeader(request) },
  });
  return forward(response);
}

export async function PATCH(request: Request) {
  const payload = (await request.json().catch(() => null)) as { id?: number; role?: string; tenant_id?: number | null } | null;
  const id = Number(payload?.id);
  const role = payload?.role?.trim();
  if (!Number.isFinite(id) || id <= 0 || !role) {
    return NextResponse.json({ detail: 'User id and role are required.' }, { status: 400 });
  }
  const response = await fetch(`${backendOrigin()}/system/users/${id}/role`, {
    method: 'PATCH',
    cache: 'no-store',
    headers: {
      Authorization: authHeader(request),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role, tenant_id: payload?.tenant_id ?? null }),
  });
  return forward(response);
}
