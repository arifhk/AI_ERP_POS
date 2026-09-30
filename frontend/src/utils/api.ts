function resolveApiBase() {
  const configured = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
  const pointsAtThisSite = !configured || configured === 'https://ai-erp-pos.vercel.app';
  if (pointsAtThisSite) {
    return process.env.NODE_ENV === 'production' ? '/pos-api' : 'http://localhost:8000';
  }
  return configured;
}

export const API_BASE = resolveApiBase();

let clientNavigate = (href: string) => {
  window.location.assign(href);
};

export function setClientNavigator(navigate: (href: string) => void) {
  clientNavigate = navigate;
}

export function authHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = authHeaders(init?.headers);

  const response = await fetch(input, { ...init, headers });

  if (
    response.status === 401 &&
    typeof window !== 'undefined' &&
    window.location.pathname !== '/login'
  ) {
    localStorage.clear();
    clientNavigate('/login');
  }

  return response;
}
