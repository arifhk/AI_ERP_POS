'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API_BASE = 'http://localhost:8000';

type Product = {
  id: number;
  name: string;
  barcode: string;
  price: number;
  stock_quantity: number;
  is_active: boolean;
};

function formatPrice(price: number) {
  return `৳ ${price.toLocaleString('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      try {
        const response = await fetch(`${API_BASE}/products/`);
        if (!response.ok) {
          throw new Error('Failed to load products');
        }

        const data: unknown = await response.json();
        if (!cancelled) {
          setProducts(Array.isArray(data) ? (data as Product[]) : []);
        }
      } catch {
        if (!cancelled) {
          setError('Unable to load products from the server.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadProducts();
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
          <Link href="/" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700">Dashboard</Link>
          <Link href="/tenants" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700">Tenants</Link>
          <Link href="/branches" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700">Branches</Link>
          <Link href="/users" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700">Users</Link>
          <Link href="/products" className="block py-2.5 px-4 rounded transition duration-200 bg-gray-800 hover:bg-gray-700">Products</Link>
          <Link href="/pos" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700">POS</Link>
          <Link href="/settings" className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700">Settings</Link>
        </nav>
      </aside>

      {/* Main Content Area */}
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
            <button className="text-gray-500 hover:text-gray-700 text-xl">
              🔔
            </button>
            <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold cursor-pointer">
              AH
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-gray-800">Products</h1>
              <p className="mt-1 text-sm text-gray-500">Manage catalog items, barcodes, pricing, and stock.</p>
            </div>
            <button
              type="button"
              className="rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Add New Product
            </button>
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
                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Name</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Barcode</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Price</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Stock</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {products.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">
                            No products found. Add a product to get started.
                          </td>
                        </tr>
                      ) : (
                        products.map((product) => (
                          <tr key={product.id} className="hover:bg-gray-50">
                            <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                              {product.name}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 font-mono text-sm text-gray-600">
                              {product.barcode}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-gray-900">
                              {formatPrice(product.price)}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                              {product.stock_quantity}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  product.is_active
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {product.is_active ? 'Active' : 'Inactive'}
                              </span>
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
