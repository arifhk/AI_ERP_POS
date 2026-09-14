'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

const API_BASE = 'http://localhost:8000';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          username: email,
          password,
        }),
      });

      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? 'Incorrect email or password'
            : 'Unable to sign in. Please try again.',
        );
      }

      const data: { access_token?: string } = await response.json();
      if (!data.access_token) {
        throw new Error('Unable to sign in. Please try again.');
      }

      localStorage.setItem('token', data.access_token);
      const payload = JSON.parse(
        atob(
          data.access_token
            .split('.')[1]
            .replace(/-/g, '+')
            .replace(/_/g, '/'),
        ),
      ) as { role?: string };
      localStorage.setItem('userRole', payload.role ?? '');
      const isAdmin = (payload.role ?? '').toLowerCase() === 'admin';
      router.push(isAdmin ? '/' : '/pos');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Incorrect email or password');
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.18),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(15,23,42,0.08),_transparent_45%)]" />
      <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-indigo-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-10 h-64 w-64 rounded-full bg-slate-300/30 blur-3xl" />

      <main className="relative w-full max-w-md">
        <div className="rounded-2xl border border-white/80 bg-white/95 p-8 shadow-xl shadow-slate-900/8 ring-1 ring-slate-200/70 backdrop-blur sm:p-10">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold tracking-tight text-white shadow-md shadow-indigo-600/30">
              AI
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              AI ERP & POS
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Sign in to continue to your workspace
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-indigo-400"
            >
              {submitting ? 'Logging in...' : 'Sign In'}
            </button>
          </form>

          {error ? (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-sm font-medium text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Secure access for authorized staff only
        </p>
      </main>
    </div>
  );
}
