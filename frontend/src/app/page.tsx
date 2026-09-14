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

function parseChartData(payload: unknown): ChartPoint[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload
    .map((row) => {
      if (!row || typeof row !== 'object') {
        return null;
      }
      const date = 'date' in row && typeof row.date === 'string' ? row.date : null;
      const total = 'total' in row && typeof row.total === 'number' ? row.total : 0;
      return date ? { date, total } : null;
    })
    .filter((row): row is ChartPoint => row !== null);
}

export default function Dashboard() {
  const router = useRouter();
  const [totalSales, setTotalSales] = useState(0);
  const [activeBranches, setActiveBranches] = useState(0);
  const [newUsers, setNewUsers] = useState(0);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const isAdmin = getStoredRole()?.toLowerCase() === 'admin';
    if (!isAdmin) {
      router.push('/pos');
      return;
    }

    let cancelled = false;

    async function loadDashboard() {
      try {
        const [branchesRes, usersRes, statsRes, chartRes] = await Promise.all([
          apiFetch(`${API_BASE}/branches/`),
          apiFetch(`${API_BASE}/users/`),
          apiFetch(`${API_BASE}/dashboard-stats/`),
          apiFetch(`${API_BASE}/chart-data/`),
        ]);

        if (!branchesRes.ok || !usersRes.ok || !statsRes.ok || !chartRes.ok) {
          throw new Error('Failed to load dashboard data');
        }

        const branches: unknown = await branchesRes.json();
        const users: unknown = await usersRes.json();
        const stats: unknown = await statsRes.json();
        const chart: unknown = await chartRes.json();
        const sales =
          stats &&
          typeof stats === 'object' &&
          'total_sales' in stats &&
          typeof stats.total_sales === 'number'
            ? stats.total_sales
            : 0;
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
          setActiveBranches(Array.isArray(branches) ? branches.length : 0);
          setNewUsers(userCount);
          setChartData(parseChartData(chart));
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
  }, [router]);

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
          <h1 className="text-3xl font-semibold text-gray-800 mb-6">Dashboard Overview</h1>

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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {/* Card 1 */}
                <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-500">Total Sales</p>
                      <p className="text-3xl font-bold text-gray-900">{formatCurrency(totalSales)}</p>
                    </div>
                    <div className="p-3 bg-green-100 rounded-full text-green-600 text-2xl">💰</div>
                  </div>
                </div>

                {/* Card 2 */}
                <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-500">Active Branches</p>
                      <p className="text-3xl font-bold text-gray-900">{activeBranches}</p>
                    </div>
                    <div className="p-3 bg-blue-100 rounded-full text-blue-600 text-2xl">🏢</div>
                  </div>
                </div>

                {/* Card 3 */}
                <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-500">New Users</p>
                      <p className="text-3xl font-bold text-gray-900">{newUsers}</p>
                    </div>
                    <div className="p-3 bg-purple-100 rounded-full text-purple-600 text-2xl">👥</div>
                  </div>
                </div>
              </div>

              <div className="mb-8 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-6 flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">Sales trend</h2>
                    <p className="mt-1 text-sm text-gray-500">Daily order totals across all branches</p>
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
