'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '../../components/Sidebar';
import { API_BASE, apiFetch } from '../../utils/api';
import { getStoredRole, isAdminRole } from '../../utils/auth';

type Customer = {
  customer_phone: string;
  total_visits: number;
  total_spent: number;
};

function formatCurrency(amount: number) {
  return `৳ ${amount.toLocaleString('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function parseCustomers(payload: unknown): Customer[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((row) => {
      if (!row || typeof row !== 'object') {
        return null;
      }
      const phone =
        'customer_phone' in row && typeof row.customer_phone === 'string'
          ? row.customer_phone.trim()
          : '';
      const visits =
        'total_visits' in row && typeof row.total_visits === 'number' ? row.total_visits : 0;
      const spent =
        'total_spent' in row && typeof row.total_spent === 'number' ? row.total_spent : 0;
      return phone ? { customer_phone: phone, total_visits: visits, total_spent: spent } : null;
    })
    .filter((row): row is Customer => row !== null)
    .sort((a, b) => b.total_spent - a.total_spent);
}

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdminRole(getStoredRole())) {
      router.push('/pos');
      return;
    }

    let cancelled = false;

    async function loadCustomers() {
      try {
        const response = await apiFetch(`${API_BASE}/customers/`);
        if (!response.ok) {
          throw new Error('Failed to load customers');
        }
        const data: unknown = await response.json();
        if (!cancelled) {
          setCustomers(parseCustomers(data));
        }
      } catch {
        if (!cancelled) {
          setError('Unable to load customers from the server.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadCustomers();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const ranked = useMemo(
    () => [...customers].sort((a, b) => b.total_spent - a.total_spent),
    [customers],
  );

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar active="customers" />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between p-4 bg-white border-b border-gray-200">
          <div className="flex items-center">
            <input
              type="text"
              placeholder="Search..."
              className="w-64 px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-center space-x-4">
            <button className="text-gray-500 hover:text-gray-700 text-xl">🔔</button>
            <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold cursor-pointer">
              AH
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-6">
          <div className="mb-6">
            <h1 className="text-3xl font-semibold text-gray-800">Customers</h1>
            <p className="mt-1 text-sm text-gray-500">
              Loyal customers from POS checkouts, ranked by total amount spent.
            </p>
          </div>

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

              <div className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
                        >
                          Customer Phone
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
                        >
                          Total Visits
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500"
                        >
                          Total Amount Spent
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {ranked.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-6 py-12 text-center text-sm text-gray-500">
                            No customer phone numbers recorded at the POS yet.
                          </td>
                        </tr>
                      ) : (
                        ranked.map((customer) => (
                          <tr key={customer.customer_phone} className="hover:bg-gray-50">
                            <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                              {customer.customer_phone}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                              {customer.total_visits}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-semibold text-gray-900">
                              {formatCurrency(customer.total_spent)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
