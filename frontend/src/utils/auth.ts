function normalizeRole(role: string | null | undefined) {
  return (role ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function isSystemOwner(role: string | null | undefined): boolean {
  const value = normalizeRole(role);
  return value === 'system_owner' || value === 'root' || value === 'god';
}

export function isPlatformRole(role: string | null | undefined): boolean {
  const value = normalizeRole(role);
  return value === 'system_owner' || value === 'super_admin' || value === 'owner' || value === 'root';
}

export function isAdminRole(role: string | null | undefined): boolean {
  const value = normalizeRole(role);
  return isPlatformRole(role) || value === 'admin' || value === 'tenant_admin';
}

export function getStoredRole(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem('userRole');
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length < 2) {
    return {};
  }
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  try {
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return {};
  }
}
