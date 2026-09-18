'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Sidebar } from '../components/Sidebar';
import { API_BASE, apiFetch } from '../utils/api';
import { getStoredRole } from '../utils/auth';

type ChartPoint = {
  date: string;
  total: number;
};

type DateFilter = 'today' | 'week' | 'all';

const DATE_FILTERS: { id: DateFilter; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'all', label: 'All Time' },
];

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function getDateRange(filter: DateFilter): { start_date: string; end_date: string } | null {
  if (filter === 'all') {
    return null;
  }

  const now = new Date();
  const end = endOfLocalDay(now);

  if (filter === 'today') {
    return {
      start_date: startOfLocalDay(now).toISOString(),
      end_date: end.toISOString(),
    };
  }

  const weekday = now.getDay();
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  const monday = startOfLocalDay(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysFromMonday),
  );

  return {
    start_date: monday.toISOString(),
    end_date: end.toISOString(),
  };
}

function withDateQuery(url: string, range: { start_date: string; end_date: string } | null) {
  if (!range) {
    return url;
  }
  const params = new URLSearchParams({
    start_date: range.start_date,
    end_date: range.end_date,
  });
  return `${url}?${params.toString()}`;
}

function formatCurrency(amount: number) {
  return `৳ ${amount.toLocaleString('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatChartDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function sumRefundAmounts(payload: unknown): number {
  if (!Array.isArray(payload)) {
    return 0;
  }
  return payload.reduce((total, row) => {
    if (
      !row ||
      typeof row !== 'object' ||
      !('refund_amount' in row) ||
      typeof row.refund_amount !== 'number'
    ) {
      return total;
    }
    return total + row.refund_amount;
  }, 0);
}

function sumExpenseAmounts(payload: unknown): number {
  if (!Array.isArray(payload)) {
    return 0;
  }
  return payload.reduce((total, row) => {
    if (!row || typeof row !== 'object' || !('amount' in row) || typeof row.amount !== 'number') {
      return total;
    }
    return total + row.amount;
  }, 0);
}

function sumOrderTotals(payload: unknown): number {
  if (!Array.isArray(payload)) {
    return 0;
  }
  return payload.reduce((total, row) => {
    if (
      !row ||
      typeof row !== 'object' ||
      !('total_amount' in row) ||
      typeof row.total_amount !== 'number'
    ) {
      return total;
    }
    return total + row.total_amount;
  }, 0);
}

function chartFromOrders(payload: unknown): ChartPoint[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  const buckets = new Map<string, number>();
  for (const row of payload) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    const createdAt =
      'created_at' in row && typeof row.created_at === 'string' ? row.created_at : null;
    const amount =
      'total_amount' in row && typeof row.total_amount === 'number' ? row.total_amount : 0;
    if (!createdAt) {
      continue;
    }
    const parsed = new Date(createdAt);
    if (Number.isNaN(parsed.getTime())) {
      continue;
    }
    const key = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(
      parsed.getDate(),
    ).padStart(2, '0')}`;
    buckets.set(key, (buckets.get(key) ?? 0) + amount);
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, total]) => ({ date, total }));
}

export default function Dashboard() {
  const router = useRouter();
  const [totalSales, setTotalSales] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [totalReturns, setTotalReturns] = useState(0);
  const [activeBranches, setActiveBranches] = useState(0);
  const [newUsers, setNewUsers] = useState(0);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const isAdmin = getStoredRole()?.toLowerCase() === 'admin';
    if (!isAdmin) {
      router.push('/pos');
      return;
    }

    let cancelled = false;
    const range = getDateRange(dateFilter);

    async function loadDashboard() {
      try {
        const [branchesRes, usersRes, statsRes, ordersRes, expensesRes, returnsRes] = await Promise.all([
          apiFetch(`${API_BASE}/branches/`),
          apiFetch(`${API_BASE}/users/`),
          apiFetch(`${API_BASE}/dashboard-stats/`),
          apiFetch(withDateQuery(`${API_BASE}/orders/`, range)),
          apiFetch(withDateQuery(`${API_BASE}/expenses/`, range)),
          apiFetch(withDateQuery(`${API_BASE}/returns/`, range)),
        ]);

        if (
          !branchesRes.ok ||
          !usersRes.ok ||
          !statsRes.ok ||
          !ordersRes.ok ||
          !expensesRes.ok ||
          !returnsRes.ok
        ) {
          throw new Error('Failed to load dashboard data');
        }

        const branches: unknown = await branchesRes.json();
        const users: unknown = await usersRes.json();
        const stats: unknown = await statsRes.json();
        const orders: unknown = await ordersRes.json();
        const expenses: unknown = await expensesRes.json();
        const returns: unknown = await returnsRes.json();
        const sales = sumOrderTotals(orders);
        const userCount =
          stats &&
          typeof stats === 'object' &&
          'user_count' in stats &&
          typeof stats.user_count === 'number'
            ? stats.user_count
            : Array.isArray(users)
              ? users.length
              : 0;

        if (!cancelled) {
          setTotalSales(sales);
          setTotalExpenses(sumExpenseAmounts(expenses));
          setTotalReturns(sumRefundAmounts(returns));
          setActiveBranches(Array.isArray(branches) ? branches.length : 0);
          setNewUsers(userCount);
          setChartData(chartFromOrders(orders));
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError('Unable to load data from the server.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [router, dateFilter]);

  const cashInHand = totalSales - totalExpenses - totalReturns;

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar active="dashboard" />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="flex items-center justify-between p-4 bg-white border-b border-gray-200">
          <div className="flex items-center">
            <input
              type="text"
              placeholder="Search..."
              className="w-64 px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-center space-x-4">
            <button className="text-gray-500 hover:text-gray-700 text-xl">
              🔔
            </button>
            <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold cursor-pointer">
              AH
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-6">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-3xl font-semibold text-gray-800">Dashboard Overview</h1>
            <div
              className="inline-flex rounded-lg bg-white p-1 shadow-sm ring-1 ring-gray-200"
              role="group"
              aria-label="Date filter"
            >
              {DATE_FILTERS.map((option) => {
                const active = dateFilter === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setDateFilter(option.id)}
                    className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                      active
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
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

              {/* Stats Cards */}
              <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                <div className="rounded-lg border border-gray-100 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-500">Total Sales</p>
                      <p className="mt-1 truncate text-2xl font-bold text-gray-900 xl:text-3xl">
                        {formatCurrency(totalSales)}
                      </p>
                    </div>
                    <div className="shrink-0 rounded-full bg-green-100 p-3 text-2xl text-green-600">💰</div>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-100 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-amber-600">Total Returns</p>
                      <p className="mt-1 truncate text-2xl font-bold text-amber-800 xl:text-3xl">
                        {formatCurrency(totalReturns)}
                      </p>
                    </div>
                    <div className="shrink-0 rounded-full bg-amber-100 p-3 text-2xl text-amber-700">↩️</div>
                  </div>
                </div>

                <div className="rounded-lg border border-rose-100 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-rose-500">Total Expenses</p>
                      <p className="mt-1 truncate text-2xl font-bold text-rose-700 xl:text-3xl">
                        {formatCurrency(totalExpenses)}
                      </p>
                    </div>
                    <div className="shrink-0 rounded-full bg-rose-100 p-3 text-2xl text-rose-600">📉</div>
                  </div>
                </div>

                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-emerald-700">Cash in Hand</p>
                      <p
                        className={`mt-1 truncate text-2xl font-extrabold xl:text-3xl ${
                          cashInHand >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {formatCurrency(cashInHand)}
                      </p>
                      <p className="mt-1 text-xs text-emerald-600/80">Net balance (sales − expenses − returns)</p>
                    </div>
                    <div className="shrink-0 rounded-full bg-emerald-100 p-3 text-2xl text-emerald-700">💵</div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-100 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-500">Active Branches</p>
                      <p className="mt-1 text-2xl font-bold text-gray-900 xl:text-3xl">{activeBranches}</p>
                    </div>
                    <div className="shrink-0 rounded-full bg-blue-100 p-3 text-2xl text-blue-600">🏢</div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-100 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-500">New Users</p>
                      <p className="mt-1 text-2xl font-bold text-gray-900 xl:text-3xl">{newUsers}</p>
                    </div>
                    <div className="shrink-0 rounded-full bg-purple-100 p-3 text-2xl text-purple-600">👥</div>
                  </div>
                </div>
              </div>

              <div className="mb-8 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-6 flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">Sales trend</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Daily order totals
                      {dateFilter === 'today'
                        ? ' for today'
                        : dateFilter === 'week'
                          ? ' for this week'
                          : ' across all branches'}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-indigo-600">
                    {chartData.length === 1 ? '1 day' : `${chartData.length} days`}
                  </p>
                </div>
                {chartData.length === 0 ? (
                  <div className="flex h-72 items-center justify-center rounded-lg bg-slate-50 text-sm text-gray-500">
                    No sales data yet. Completed POS orders will appear here.
                  </div>
                ) : (
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.28} />
                            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.04} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={formatChartDate}
                          tick={{ fill: '#64748b', fontSize: 12 }}
                          axisLine={{ stroke: '#e2e8f0' }}
                          tickLine={false}
                        />
                        <YAxis
                          tickFormatter={(value: number) =>
                            `৳ ${Number(value).toLocaleString('en-BD', { maximumFractionDigits: 0 })}`
                          }
                          tick={{ fill: '#64748b', fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                          width={72}
                        />
                        <Tooltip
                          cursor={{ stroke: '#c7d2fe', strokeWidth: 1 }}
                          formatter={(value) => [formatCurrency(Number(value ?? 0)), 'Sales']}
                          labelFormatter={(label) => formatChartDate(String(label))}
                          contentStyle={{
                            borderRadius: 12,
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 10px 15px -3px rgb(15 23 42 / 0.08)',
                            fontSize: 13,
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="total"
                          stroke="#4f46e5"
                          strokeWidth={2.5}
                          fill="url(#salesFill)"
                          activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Recent Activity Area */}
              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
                <h2 className="text-xl font-bold text-gray-800 mb-4">Recent Activity</h2>
                <p className="text-gray-600">Your recent POS transactions and ERP updates will appear here.</p>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
