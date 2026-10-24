import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { redis } from '../../../lib/redis';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CATALOG_TTL_SECONDS = 3600;
const MAX_PAGES = 200;

type CatalogPage = {
  items?: unknown[];
  pages?: number;
};

type CatalogPayload = {
  items: unknown[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
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

function cacheKey(authorization: string) {
  const digest = createHash('sha256').update(authorization).digest('hex');
  return `pos:products:${digest}`;
}

async function readCached(key: string) {
  if (!redis) {
    return null;
  }
  try {
    const cached = await redis.get<CatalogPayload>(key);
    if (!cached || !Array.isArray(cached.items)) {
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

async function writeCached(key: string, payload: CatalogPayload) {
  if (!redis) {
    return;
  }
  try {
    await redis.set(key, payload, { ex: CATALOG_TTL_SECONDS });
  } catch {
    // The register still receives the catalog when Redis is unreachable.
  }
}

async function fetchCatalog(authorization: string): Promise<{ payload: CatalogPayload } | { response: Response }> {
  const items: unknown[] = [];
  let page = 1;
  let pages = 1;
  while (page <= pages && page <= MAX_PAGES) {
    const response = await fetch(`${backendOrigin()}/products/table?page=${page}&page_size=100&status=active`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Authorization: authorization },
    });
    if (!response.ok) {
      return { response };
    }
    const body = (await response.json()) as CatalogPage;
    items.push(...(body.items ?? []));
    pages = Math.max(1, Number(body.pages) || 1);
    page += 1;
  }
  return {
    payload: {
      items,
      total: items.length,
      page: 1,
      page_size: items.length,
      pages: 1,
    },
  };
}

export async function GET(request: Request) {
  const authorization = request.headers.get('authorization')?.trim() ?? '';
  if (!authorization) {
    return NextResponse.json({ detail: 'Not authenticated' }, { status: 401 });
  }

  const key = cacheKey(authorization);
  const cached = await readCached(key);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const result = await fetchCatalog(authorization);
    if ('response' in result) {
      const body = await result.response.text();
      return new NextResponse(body || '{}', {
        status: result.response.status,
        headers: {
          'content-type': result.response.headers.get('content-type') ?? 'application/json',
        },
      });
    }
    await writeCached(key, result.payload);
    return NextResponse.json(result.payload);
  } catch {
    return NextResponse.json({ detail: 'Product catalog is unavailable.' }, { status: 502 });
  }
}
