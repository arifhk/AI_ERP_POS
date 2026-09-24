'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { AppShell, PageHeading } from '../../components/AppShell';
import { API_BASE, apiFetch } from '../../utils/api';

type Expense = {
  id: number;
  description: string;
  amount: number;
  date: string;
  created_by: string;
};

const emptyForm = {
  description: '',
  amount: '',
};

function formatCurrency(amount: number) {
  return `৳ ${amount.toLocaleString('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatExpenseDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  async function loadExpenses() {
    const response = await apiFetch(`${API_BASE}/expenses/`);
    if (!response.ok) {
      throw new Error('Failed to load expenses');
    }
    const data: unknown = await response.json();
    setExpenses(Array.isArray(data) ? (data as Expense[]) : []);
  }

  useEffect(() => {
    let cancelled = false;

    async function initialLoad() {
      try {
        await loadExpenses();
      } catch {
        if (!cancelled) {
          setError('Unable to load expenses from the server.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    initialLoad();
    return () => {
      cancelled = true;
    };
  }, []);

  function openModal() {
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (submitting) {
      return;
    }
    setModalOpen(false);
    setFormError(null);
    setForm(emptyForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      const response = await apiFetch(`${API_BASE}/expenses/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: form.description.trim(),
          amount: Number(form.amount),
        }),
      });

      if (!response.ok) {
        let message = 'Could not save the expense.';
        try {
          const payload = (await response.json()) as { detail?: unknown };
          if (typeof payload.detail === 'string') {
            message = payload.detail;
          }
        } catch {
          // Keep the generic message if the error body is not JSON.
        }
        throw new Error(message);
      }

      setModalOpen(false);
      setForm(emptyForm);
      await loadExpenses();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Could not save the expense.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
    <AppShell active="expenses">
          <PageHeading
            title="Expenses"
            description="Log petty cash spending for your branch."
            action={
            <button
              type="button"
              onClick={openModal}
              className="rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Add Expense
            </button>
            }
          />

          {loading ? (
            <div className="flex items-center justify-center rounded-lg border border-gray-100 bg-white p-16 shadow-sm">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                <p className="text-sm font-medium text-gray-500">Loading data...</p>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-6 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="hidden overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm md:block">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
                        >
                          Date
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
                        >
                          Description
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500"
                        >
                          Amount
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
                        >
                          Created By
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {expenses.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-sm text-gray-500">
                            No expenses recorded yet. Add an expense to get started.
                          </td>
                        </tr>
                      ) : (
                        expenses.map((expense) => (
                          <tr key={expense.id} className="hover:bg-gray-50">
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                              {formatExpenseDate(expense.date)}
                            </td>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">
                              {expense.description}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-semibold text-gray-900">
                              {formatCurrency(expense.amount)}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                              {expense.created_by}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="grid gap-3 md:hidden">
                {expenses.length === 0 ? (
                  <div className="rounded-lg border border-gray-100 bg-white px-4 py-12 text-center text-sm text-gray-500 shadow-sm">
                    No expenses recorded yet. Add an expense to get started.
                  </div>
                ) : (
                  expenses.map((expense) => (
                    <article key={expense.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="min-w-0 text-sm font-semibold text-gray-900">{expense.description}</h2>
                        <p className="shrink-0 text-sm font-semibold text-gray-900">{formatCurrency(expense.amount)}</p>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        {formatExpenseDate(expense.date)} · {expense.created_by}
                      </p>
                    </article>
                  ))
                )}
              </div>
            </>
          )}
    </AppShell>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-expense-title"
        >
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 id="add-expense-title" className="text-lg font-semibold text-gray-900">
                Add Expense
              </h2>
              <p className="mt-1 text-sm text-gray-500">Record petty cash spending for this branch.</p>
            </div>

            <form onSubmit={(event) => void handleSubmit(event)} className="px-6 py-5">
              <div className="space-y-4">
                <div>
                  <label htmlFor="expense-description" className="mb-1 block text-sm font-medium text-gray-700">
                    Description
                  </label>
                  <input
                    id="expense-description"
                    required
                    value={form.description}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, description: event.target.value }))
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. Office tea and snacks"
                  />
                </div>
                <div>
                  <label htmlFor="expense-amount" className="mb-1 block text-sm font-medium text-gray-700">
                    Amount
                  </label>
                  <input
                    id="expense-amount"
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, amount: event.target.value }))
                    }
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {formError && (
                <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
                >
                  {submitting ? 'Saving...' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
