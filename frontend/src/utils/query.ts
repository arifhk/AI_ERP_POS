'use client';

import useSWR, { preload, type SWRConfiguration } from 'swr';
import { API_BASE, apiFetch } from './api';

const options: SWRConfiguration = {
  revalidateOnFocus: false,
  dedupingInterval: 20_000,
  keepPreviousData: true,
};

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await apiFetch(url);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export function useApi<T>(url: string | null) {
  return useSWR<T>(url, fetchJson, options);
}

export function preloadApi(url: string) {
  return preload(url, fetchJson);
}

const ROUTE_DATA: Record<string, string[]> = {
  '/': [
    `${API_BASE}/orders/`,
    `${API_BASE}/customers/`,
    `${API_BASE}/returns/`,
    `${API_BASE}/products/?limit=200`,
    `${API_BASE}/approvals/`,
    `${API_BASE}/audit-logs/?limit=20`,
  ],
  '/products': [`${API_BASE}/products/table?page=1&page_size=10`],
  '/purchases': [`${API_BASE}/purchases/`],
  '/orders': [`${API_BASE}/orders/`],
  '/expenses': [`${API_BASE}/expenses/`],
  '/customers': [`${API_BASE}/customers/`],
  '/pos': [`${API_BASE}/products/`],
  '/users': [`${API_BASE}/users/?limit=200`],
  '/tenants': [`${API_BASE}/tenants/`],
  '/branches': [`${API_BASE}/branches/`],
  '/master-data/categories': [`${API_BASE}/masters/catalog`, `${API_BASE}/approvals/`],
  '/masters': [`${API_BASE}/masters/catalog`, `${API_BASE}/approvals/`],
  '/system-management/users': [`${API_BASE}/system/users`],
};

export function prefetchRoute(href: string) {
  const path = href.split('?')[0] || href;
  for (const url of ROUTE_DATA[path] ?? []) {
    void preloadApi(url);
  }
}
