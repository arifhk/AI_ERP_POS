'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API_BASE = 'http://localhost:8000';

export default function Dashboard() {
  const [activeBranches, setActiveBranches] = useState(0);
  const [newUsers, setNewUsers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        const [branchesRes, usersRes] = await Promise.all([
          fetch(`${API_BASE}/branches`),
          fetch(`${API_BASE}/users`),
        ]);

        if (!branchesRes.ok || !usersRes.ok) {
          throw new Error('Failed to load dashboard data');
        }

        const branches: unknown = await branchesRes.json();
        const users: unknown = await usersRes.json();

        if (!cancelled) {
          setActiveBranches(Array.isArray(branches) ? branches.length : 0);
          setNewUsers(Array.isArray(users) ? users.length : 0);
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
  }, []);

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-6 text-2xl font-bold border-b border-gray-800">
          AI ERP & POS
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <Link href="/" className="block py-2.5 px-4 rounded transition duration-200 bg-gray-800 hover:bg-gray-700">Dashboard</Link>
          <Link href="/tenants" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700">Tenants</Link>
          <Link href="/branches" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700">Branches</Link>
          <Link href="/users" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700">Users</Link>
          <Link href="/products" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700">Products</Link>
          <Link href="/settings" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700">Settings</Link>
        </nav>
      </aside>

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
                      <p className="text-3xl font-bold text-gray-900">৳ 2,45,000</p>
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
