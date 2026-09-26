'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { API_BASE } from '../../utils/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetPath, setResetPath] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setResetPath(null);
    try {
      const response = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const payload = (await response.json()) as { message?: string; reset_token?: string; detail?: string };
      if (!response.ok) {
        throw new Error(payload.detail || 'Could not start a password reset.');
      }
      if (payload.reset_token) {
        setResetPath(`/reset-password?token=${encodeURIComponent(payload.reset_token)}`);
      } else {
        setResetPath('');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start a password reset.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.18),_transparent_55%)]" />
      <main className="relative w-full max-w-md rounded-2xl border border-white/80 bg-white p-8 shadow-xl ring-1 ring-slate-200/70 sm:p-10">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Reset your password</h1>
        <p className="mt-2 text-sm text-slate-500">Enter the email on your account. This works for every role, including System Owner.</p>
        {resetPath === null ? (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-slate-700" htmlFor="email">
              Email
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:bg-indigo-400"
            >
              {submitting ? 'Preparing link...' : 'Send reset link'}
            </button>
          </form>
        ) : (
          <div className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p>If that email is registered, the reset link is ready. It expires in 30 minutes.</p>
            {resetPath ? (
              <Link href={resetPath} className="mt-3 inline-flex font-semibold text-indigo-700 underline">
                Continue to set a new password
              </Link>
            ) : null}
          </div>
        )}
        {error ? <p className="mt-4 text-sm font-medium text-red-700">{error}</p> : null}
        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/login" className="font-semibold text-indigo-600 hover:text-indigo-500">
            Back to sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
