'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { API_BASE } from '../../utils/api';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get('token') ?? '');
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const payload = (await response.json()) as { detail?: string };
      if (!response.ok) {
        throw new Error(typeof payload.detail === 'string' ? payload.detail : 'Could not reset the password.');
      }
      router.push('/login');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not reset the password.');
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-12">
      <main className="relative w-full max-w-md rounded-2xl border border-white/80 bg-white p-8 shadow-xl ring-1 ring-slate-200/70 sm:p-10">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Choose a new password</h1>
        <p className="mt-2 text-sm text-slate-500">This link works once and expires 30 minutes after it was created.</p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-slate-700" htmlFor="password">
            New password
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700" htmlFor="confirm">
            Confirm password
            <input
              id="confirm"
              type="password"
              required
              minLength={6}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </label>
          <button
            type="submit"
            disabled={submitting || !token}
            className="flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:bg-indigo-400"
          >
            {submitting ? 'Saving...' : 'Update password'}
          </button>
        </form>
        {!token ? <p className="mt-4 text-sm text-amber-700">This reset link is missing a token.</p> : null}
        {error ? <p className="mt-4 text-sm font-medium text-red-700">{error}</p> : null}
        <p className="mt-6 text-center text-sm">
          <Link href="/forgot-password" className="font-semibold text-indigo-600 hover:text-indigo-500">
            Request a new link
          </Link>
        </p>
      </main>
    </div>
  );
}
