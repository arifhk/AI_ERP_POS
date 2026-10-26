'use client';

import useSWR, { mutate, type SWRConfiguration } from 'swr';
import { API_BASE, apiJson } from '../utils/api';

export function apiKey(path: string) {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

export function useApi<T>(path: string | null, config?: SWRConfiguration<T>) {
  const key = path == null ? null : apiKey(path);
  return useSWR<T>(key, apiJson<T>, config);
}

export function revalidateApi(pathOrPrefix: string) {
  const full = apiKey(pathOrPrefix);
  return mutate((key) => typeof key === 'string' && (key === full || key.startsWith(full)));
}

export function clearApiCache() {
  return mutate(() => true, undefined, { revalidate: false });
}
