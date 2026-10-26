import { createHash } from 'crypto';

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CATALOG_TTL_SECONDS = 3600;
const MAX_PAGES = 200;
const ON_VERCEL = process.env.VERCEL === '1';

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

type SellableProduct = {
  id: number;
  barcode: string;
  name: string;
  price: number;
  stock: number;
  stock_quantity: number;
  vat_percent: number;
  sale_vat: number;
  is_active: boolean;
  is_hidden: boolean;
};

const SAMPLE_PRODUCTS: SellableProduct[] = [
  sellable(9001, '8941100100001', 'Miniket Rice 5kg', 420, 36, 0),
  sellable(9002, '8941100100002', 'Fresh Milk 1L', 95, 48, 5),
  sellable(9003, '8941100100003', 'Soybean Oil 2L', 360, 24, 5),
  sellable(9004, '8941100100004', 'Loose Sugar 1kg', 130, 60, 0),
  sellable(9005, '8941100100005', 'Eggs Dozen', 155, 40, 0),
  sellable(9006, '8941100100006', 'Mineral Water 500ml', 20, 120, 15),
  sellable(9007, '8941100100007', 'Potato Chips 25g', 30, 80, 15),
  sellable(9008, '8941100100008', 'Hand Wash 200ml', 145, 32, 15),
];

function sellable(id: number, barcode: string, name: string, price: number, stock: number, vatPercent: number): SellableProduct {
  return {
    id,
    barcode,
    name,
    price,
    stock,
    stock_quantity: stock,
    vat_percent: vatPercent,
    sale_vat: vatPercent,
    is_active: true,
    is_hidden: false,
  };
}

function backendOrigin() {
  const configured = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
  if (configured && !configured.includes('vercel.app')) {
    try {
      const url = new URL(configured);
      const allowed = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === 'ai-erp-pos-api.onrender.com';
      if (allowed && (url.protocol === 'http:' || url.protocol === 'https:')) {
        return url.origin;
      }
    } catch {
      return 'http://127.0.0.1:8000';
    }
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

function cleanText(value: unknown, max: number) {
  return String(value ?? '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

function asNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeProduct(row: unknown, index: number): SellableProduct | null {
  if (!row || typeof row !== 'object') {
    return null;
  }
  const record = row as Record<string, unknown>;
  const barcode = cleanText(record.barcode, 80);
  const name = cleanText(record.name, 255);
  if (!barcode || !name) {
    return null;
  }
  const id = Math.trunc(asNumber(record.id, index + 1));
  const stock = Math.max(0, Math.trunc(asNumber(record.stock_quantity ?? record.stock)));
  const vat = Math.max(0, asNumber(record.vat_percent ?? record.sale_vat));
  return {
    id: id > 0 ? id : index + 1,
    barcode,
    name,
    price: Math.max(0, asNumber(record.price)),
    stock,
    stock_quantity: stock,
    vat_percent: vat,
    sale_vat: vat,
    is_active: record.is_active !== false,
    is_hidden: record.is_hidden === true,
  };
}

function productsFromPayload(payload: unknown): SellableProduct[] {
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as CatalogPayload).items)
      ? (payload as CatalogPayload).items
      : [];
  return rows.map(normalizeProduct).filter((row): row is SellableProduct => row !== null && row.is_active && !row.is_hidden);
}

async function redisClient() {
  try {
    const loaded = await import('../../../lib/redis');
    return loaded.redis ?? null;
  } catch {
    return null;
  }
}

async function readCached(key: string) {
  try {
    const client = await redisClient();
    if (!client) {
      return null;
    }
    const cached = await client.get<unknown>(key);
    return Array.isArray(cached) && cached.length > 0 ? cached : null;
  } catch {
    return null;
  }
}

async function writeCached(key: string, products: unknown[]) {
  if (products.length === 0) {
    return;
  }
  try {
    const client = await redisClient();
    if (!client) {
      return;
    }
    await client.set(key, products, { ex: CATALOG_TTL_SECONDS });
  } catch {
    // The register still receives the catalog when Redis is unreachable.
  }
}

async function fetchBackendCatalog(authorization: string): Promise<unknown[] | null> {
  const items: unknown[] = [];
  let page = 1;
  let pages = 1;
  const pageLimit = ON_VERCEL ? 1 : MAX_PAGES;
  const timeoutMs = ON_VERCEL ? 2500 : 8000;
  while (page <= pages && page <= pageLimit) {
    const response = await fetch(`${backendOrigin()}/products/table?page=${page}&page_size=100&status=active`, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: authorization, Accept: 'application/json' },
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as CatalogPage;
    items.push(...(body.items ?? []));
    pages = Math.max(1, Number(body.pages) || 1);
    page += 1;
  }
  return items;
}

async function fetchSupabaseCatalog(): Promise<SellableProduct[] | null> {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    return null;
  }
  let endpoint: URL;
  try {
    endpoint = new URL('/rest/v1/products', base);
  } catch {
    return null;
  }
  if (endpoint.protocol !== 'https:') {
    return null;
  }
  endpoint.searchParams.set('select', 'id,name,barcode,price,stock_quantity,sale_vat,is_active,is_hidden');
  endpoint.searchParams.set('is_active', 'eq.true');
  endpoint.searchParams.set('limit', '500');
  const response = await fetch(endpoint, {
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    return null;
  }
  const rows = (await response.json()) as unknown;
  const products = productsFromPayload(rows);
  return products.length > 0 ? products : null;
}

export async function GET(request: Request) {
  try {
    const authorization = request.headers.get('authorization')?.trim() ?? '';

    if (authorization) {
      const cached = await readCached(cacheKey(authorization));
      if (cached) {
        return NextResponse.json(cached);
      }
      try {
        const products = await fetchBackendCatalog(authorization);
        if (products && products.length > 0) {
          await writeCached(cacheKey(authorization), products);
          return NextResponse.json(products);
        }
      } catch {
        // Python on port 8000, or the hosted API, is unreachable.
      }
    }

    try {
      const products = await fetchSupabaseCatalog();
      if (products && products.length > 0) {
        return NextResponse.json(products);
      }
    } catch {
      // Supabase is optional. A missing key or a failed request falls through.
    }

    return NextResponse.json(SAMPLE_PRODUCTS);
  } catch {
    return NextResponse.json(SAMPLE_PRODUCTS);
  }
}
