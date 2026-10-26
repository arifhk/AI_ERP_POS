import { createHash } from 'crypto';

import { NextResponse } from 'next/server';

import type { LocalProduct } from '../../../lib/db';
import { enforceRateLimit, getRedis } from '../../../lib/redis';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_TTL_SECONDS = 3600;
const PAGE_SIZE = 100;
const MAX_PAGES = 50;

const PRIVILEGED_ROLES = new Set([
  'system_owner',
  'super_admin',
  'owner',
  'root',
  'admin',
  'tenant_admin',
]);

type BackendVariant = {
  id?: number;
  sku?: string;
  attributes?: Record<string, string>;
  stock_quantity?: number;
  effective_price?: number;
  effective_sale_vat?: number;
};

type BackendProduct = {
  id?: number;
  branch_id?: number | null;
  name?: string;
  barcode?: string;
  additional_barcodes?: string[];
  item_code?: string | null;
  design_code?: string;
  price?: number;
  stock_quantity?: number;
  sale_vat?: number;
  is_active?: boolean;
  is_hidden?: boolean;
  variants?: BackendVariant[];
};

type SessionClaims = {
  role: string;
  branchId: number | null;
  tenantId: number | null;
};

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function backendOrigin(): string {
  const configured = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error('Backend origin is invalid');
  }
  const allowed = new Set(['127.0.0.1', 'localhost', 'ai-erp-pos-api.onrender.com']);
  if (!allowed.has(url.hostname) || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    throw new Error('Backend origin is not allowlisted');
  }
  if ((url.hostname === '127.0.0.1' || url.hostname === 'localhost') && url.port && url.port !== '8000') {
    throw new Error('Backend origin is not allowlisted');
  }
  return url.origin;
}

function readToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (header && /^bearer\s+\S+/i.test(header)) {
    return header.replace(/^bearer\s+/i, '').trim();
  }
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
  if (!match?.[1]) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function decodeClaims(token: string): SessionClaims | null {
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
    const role = typeof payload.role === 'string' ? payload.role.trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
    const branchRaw = Number(payload.branch_id);
    const tenantRaw = Number(payload.tenant_id);
    return {
      role,
      branchId: Number.isInteger(branchRaw) && branchRaw > 0 ? branchRaw : null,
      tenantId: Number.isInteger(tenantRaw) && tenantRaw > 0 ? tenantRaw : null,
    };
  } catch {
    return null;
  }
}

function rateLimitId(request: Request, token: string | null): string {
  const ip = (request.headers.get('x-forwarded-for') ?? 'local').split(',')[0]?.trim() || 'local';
  const digest = createHash('sha256')
    .update(token ?? ip)
    .digest('hex')
    .slice(0, 16);
  return `${ip}:${digest}`;
}

function cleanText(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

function cleanBarcode(value: unknown): string | null {
  const cleaned = cleanText(value, 80);
  if (!cleaned || !/^[A-Za-z0-9][A-Za-z0-9 ._+\/-]{0,79}$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

function asMoney(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }
  return Math.round(number * 100) / 100;
}

function ownsBranch(claims: SessionClaims, requested: number | null): boolean {
  if (requested === null) {
    return true;
  }
  if (PRIVILEGED_ROLES.has(claims.role)) {
    return true;
  }
  return claims.branchId !== null && claims.branchId === requested;
}

function cacheKey(claims: SessionClaims, branchId: number | null): string {
  if (branchId !== null) {
    return `pos:products:${branchId}`;
  }
  if (claims.tenantId !== null) {
    return `pos:products:tenant:${claims.tenantId}`;
  }
  return 'pos:products:session';
}

function flattenProduct(product: BackendProduct, branchId: number | null, includeUnassigned: boolean): LocalProduct[] {
  if (product.is_active === false || product.is_hidden) {
    return [];
  }
  const productBranch = product.branch_id == null ? null : Number(product.branch_id);
  if (branchId !== null) {
    if (productBranch === null && !includeUnassigned) {
      return [];
    }
    if (productBranch !== null && productBranch !== branchId) {
      return [];
    }
  }
  const productId = Number(product.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return [];
  }
  const name = cleanText(product.name, 255);
  const price = asMoney(product.price);
  const stock = Math.max(0, Math.trunc(Number(product.stock_quantity) || 0));
  const vat = asMoney(product.sale_vat);
  const branch = product.branch_id == null ? null : Number(product.branch_id);
  const cartId = `p-${productId}`;
  const rows: LocalProduct[] = [];
  const seen = new Set<string>();

  const push = (id: string, barcode: string, row?: Partial<LocalProduct>) => {
    const key = barcode.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    rows.push({
      id,
      barcode,
      name: row?.name ?? name,
      price: row?.price ?? price,
      stock: row?.stock ?? stock,
      vat_percent: row?.vat_percent ?? vat,
      cart_id: row?.cart_id ?? cartId,
      branch_id: branch,
    });
  };

  const primary = cleanBarcode(product.barcode);
  if (primary) {
    push(cartId, primary);
  }
  for (const extra of product.additional_barcodes ?? []) {
    const barcode = cleanBarcode(extra);
    if (barcode) {
      push(`${cartId}::${barcode}`, barcode);
    }
  }
  const itemCode = cleanBarcode(product.item_code);
  if (itemCode) {
    push(`${cartId}::item:${itemCode}`, itemCode);
  }
  const design = cleanBarcode(product.design_code);
  if (design) {
    push(`${cartId}::design:${design}`, design);
  }

  for (const variant of product.variants ?? []) {
    const sku = cleanBarcode(variant.sku);
    const variantId = Number(variant.id);
    if (!sku || !Number.isInteger(variantId) || variantId <= 0) {
      continue;
    }
    const label = Object.values(variant.attributes ?? {})
      .map((part) => cleanText(part, 40))
      .filter(Boolean)
      .join(' / ');
    push(`v-${variantId}`, sku, {
      name: label ? `${name} (${label})` : name,
      price: asMoney(variant.effective_price ?? price),
      stock: Math.max(0, Math.trunc(Number(variant.stock_quantity) || 0)),
      vat_percent: asMoney(variant.effective_sale_vat ?? vat),
      cart_id: `v-${variantId}`,
    });
  }

  return rows;
}

async function backendFetch(path: string, token: string): Promise<Response> {
  return fetch(`${backendOrigin()}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  });
}

async function verifySession(token: string): Promise<Response> {
  return backendFetch('/products/?limit=1', token);
}

async function loadCatalog(token: string): Promise<BackendProduct[]> {
  const items: BackendProduct[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await backendFetch(`/products/table?page=${page}&page_size=${PAGE_SIZE}&status=active`, token);
    if (response.status === 401) {
      throw Object.assign(new Error('Unauthorized'), { status: 401 });
    }
    if (response.status === 403) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    if (!response.ok) {
      throw Object.assign(new Error('Catalog request failed'), { status: 502 });
    }
    const body = (await response.json()) as { items?: BackendProduct[]; pages?: number };
    items.push(...(body.items ?? []));
    const pages = Math.min(MAX_PAGES, Number(body.pages) || 1);
    if (page >= pages) {
      break;
    }
  }
  return items;
}

export async function GET(request: Request) {
  const token = readToken(request);

  try {
    const limit = await enforceRateLimit(rateLimitId(request, token));
    if (!limit.success) {
      return jsonError('Too many catalog requests. Try again in a minute.', 429);
    }
  } catch {
    return jsonError('Catalog cache is unavailable.', 503);
  }

  if (!token) {
    return jsonError('Sign in required.', 401);
  }

  const claims = decodeClaims(token);
  if (!claims) {
    return jsonError('Sign in required.', 401);
  }

  const requestedRaw = new URL(request.url).searchParams.get('branch_id');
  const requested = requestedRaw && /^\d{1,9}$/.test(requestedRaw) ? Number(requestedRaw) : null;
  if (requestedRaw && requested === null) {
    return jsonError('Invalid branch.', 400);
  }
  if (!ownsBranch(claims, requested)) {
    return jsonError('You cannot sync another branch.', 403);
  }

  const branchId = requested ?? claims.branchId;
  const key = cacheKey(claims, branchId);

  try {
    const probe = await verifySession(token);
    if (probe.status === 401) {
      return jsonError('Sign in required.', 401);
    }
    if (probe.status === 403) {
      return jsonError('You cannot sync this catalog.', 403);
    }
    if (!probe.ok) {
      return jsonError('Catalog service is unavailable.', 502);
    }

    const redis = getRedis();
    const cached = await redis.get<LocalProduct[]>(key);
    if (Array.isArray(cached)) {
      return NextResponse.json({ products: cached, branch_id: branchId, count: cached.length, cached: true });
    }

    const source = await loadCatalog(token);
    const includeUnassigned = requested === null || requested === claims.branchId;
    const products = source.flatMap((product) => flattenProduct(product, branchId, includeUnassigned));
    await redis.set(key, products, { ex: CACHE_TTL_SECONDS });
    return NextResponse.json({ products, branch_id: branchId, count: products.length, cached: false });
  } catch (error) {
    const status = Number((error as { status?: number }).status);
    if (status === 401) {
      return jsonError('Sign in required.', 401);
    }
    if (status === 403) {
      return jsonError('You cannot sync this catalog.', 403);
    }
    return jsonError('Catalog service is unavailable.', 502);
  }
}
