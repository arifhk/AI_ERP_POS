'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../components/AppShell';
import { ActivityList, CategoryDonut, KpiValue, ProductsBarChart, RevenueAreaChart } from '../components/dashboard/charts';
import { DashboardBoard, type WidgetId } from '../components/dashboard/DashboardBoard';
import {
  DATE_FILTERS,
  buildDashboard,
  formatCurrency,
  formatWhen,
  type ApprovalRow,
  type AuditRow,
  type CustomerRow,
  type DateFilter,
  type OrderRow,
  type ReturnRow,
} from '../components/dashboard/metrics';
import { DataTable, WidgetShell, type DragHandleProps } from '../components/dashboard/WidgetShell';
import { API_BASE, apiFetch } from '../utils/api';
import { getStoredRole, isAdminRole } from '../utils/auth';

type ProductRow = {
  id: number;
  category?: string;
};

export default function Dashboard() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [categories, setCategories] = useState<Map<number, string>>(new Map());
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const isAdmin = isAdminRole(getStoredRole());
    if (!isAdmin) {
      router.push('/pos');
      return;
    }

    let cancelled = false;

    async function loadDashboard() {
      try {
        const [customersRes, ordersRes, returnsRes, productsRes, approvalsRes, auditsRes] = await Promise.all([
          apiFetch(`${API_BASE}/customers/`),
          apiFetch(`${API_BASE}/orders/`),
          apiFetch(`${API_BASE}/returns/`),
          apiFetch(`${API_BASE}/products/?limit=200`),
          apiFetch(`${API_BASE}/approvals/`),
          apiFetch(`${API_BASE}/audit-logs/?limit=20`),
        ]);
        if (!customersRes.ok || !ordersRes.ok || !returnsRes.ok || !productsRes.ok) {
          throw new Error('Failed to load dashboard data');
        }
        const customerRows: unknown = await customersRes.json();
        const orderRows: unknown = await ordersRes.json();
        const returnRows: unknown = await returnsRes.json();
        const productRows: unknown = await productsRes.json();
        const approvalRows: unknown = approvalsRes.ok ? await approvalsRes.json() : [];
        const auditRows: unknown = auditsRes.ok ? await auditsRes.json() : [];
        if (cancelled) {
          return;
        }
        setCustomers(Array.isArray(customerRows) ? (customerRows as CustomerRow[]) : []);
        setOrders(Array.isArray(orderRows) ? (orderRows as OrderRow[]) : []);
        setReturns(Array.isArray(returnRows) ? (returnRows as ReturnRow[]) : []);
        setApprovals(Array.isArray(approvalRows) ? (approvalRows as ApprovalRow[]) : []);
        setAudits(Array.isArray(auditRows) ? (auditRows as AuditRow[]) : []);
        const nextCategories = new Map<number, string>();
        if (Array.isArray(productRows)) {
          for (const row of productRows as ProductRow[]) {
            if (row && typeof row.id === 'number') {
              nextCategories.set(row.id, row.category?.trim() || 'Uncategorized');
            }
          }
        }
        setCategories(nextCategories);
        setError(null);
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

  const view = useMemo(
    () => buildDashboard({ orders, returns, customers, categories, dateFilter, approvals, audits }),
    [approvals, audits, categories, customers, dateFilter, orders, returns],
  );

  const periodLabel = DATE_FILTERS.find((option) => option.id === dateFilter)?.label ?? 'All Time';
  const categoryShare = view.categorySales.reduce((sum, entry) => sum + entry.total, 0);

  function renderWidget(id: WidgetId, handleProps: DragHandleProps) {
    if (id === 'kpi-revenue') {
      return (
        <WidgetShell
          title="Total Revenue"
          subtitle={periodLabel}
          dragHandleProps={handleProps}
          detail={
            <>
              <KpiValue value={formatCurrency(view.sales)} trend={view.trends.sales} hint="vs last week" icon="revenue" />
              <DataTable
                columns={['When', 'Customer', 'Amount']}
                rows={view.recentOrders.map((order) => [formatWhen(order.created_at), order.customer_phone || 'Walk-in', formatCurrency(order.total_amount || 0)])}
              />
            </>
          }
        >
          <KpiValue value={formatCurrency(view.sales)} trend={view.trends.sales} hint="vs last week" icon="revenue" />
        </WidgetShell>
      );
    }
    if (id === 'kpi-orders') {
      return (
        <WidgetShell
          title="Today's Orders"
          subtitle="Invoices opened today"
          dragHandleProps={handleProps}
          detail={
            <>
              <KpiValue value={String(view.todaysOrders)} trend={view.trends.invoices} hint="vs last week" icon="orders" />
              <DataTable
                columns={['When', 'Customer', 'Amount']}
                rows={view.todaysOrderRows.map((order) => [formatWhen(order.created_at), order.customer_phone || 'Walk-in', formatCurrency(order.total_amount || 0)])}
              />
            </>
          }
        >
          <KpiValue value={String(view.todaysOrders)} trend={view.trends.invoices} hint="vs last week" icon="orders" />
        </WidgetShell>
      );
    }
    if (id === 'kpi-customers') {
      return (
        <WidgetShell
          title="Total Customers"
          subtitle="Unique phones on invoices"
          dragHandleProps={handleProps}
          detail={
            <>
              <KpiValue value={String(view.customers)} trend={view.trends.customers} hint="vs last week" icon="customers" />
              <DataTable
                columns={['Phone', 'Visits', 'Spent']}
                rows={view.customerRows.slice(0, 12).map((row) => [row.customer_phone, String(row.total_visits), formatCurrency(row.total_spent)])}
              />
            </>
          }
        >
          <KpiValue value={String(view.customers)} trend={view.trends.customers} hint="vs last week" icon="customers" />
        </WidgetShell>
      );
    }
    if (id === 'kpi-approvals') {
      return (
        <WidgetShell
          title="Pending Approvals"
          subtitle="Maker-checker queue"
          dragHandleProps={handleProps}
          detail={
            <>
              <KpiValue value={String(view.pendingApprovals)} hint="waiting for review" icon="approvals" />
              <DataTable
                columns={['Request', 'Detail', 'Status']}
                rows={view.pendingRows.map((row) => [
                  `${row.action_type || row.action} ${row.module_name || row.entity_type}`,
                  row.payload?.summary || row.payload?.name || row.payload?.code_number || '—',
                  row.status,
                ])}
              />
            </>
          }
        >
          <KpiValue value={String(view.pendingApprovals)} hint="waiting for review" icon="approvals" />
        </WidgetShell>
      );
    }
    if (id === 'revenue') {
      return (
        <WidgetShell
          title="Revenue Analytics"
          subtitle="This month compared with last month"
          dragHandleProps={handleProps}
          className="min-h-[320px]"
          detail={
            <>
              <RevenueAreaChart data={view.monthComparison} height={360} />
              <DataTable
                columns={['Day', 'This month', 'Last month']}
                rows={view.monthComparison.map((point) => [point.day, formatCurrency(point.current ?? 0), formatCurrency(point.previous)])}
              />
            </>
          }
        >
          <RevenueAreaChart data={view.monthComparison} />
        </WidgetShell>
      );
    }
    if (id === 'products') {
      return (
        <WidgetShell
          title="Top Selling Products"
          subtitle={`Highest revenue · ${periodLabel}`}
          dragHandleProps={handleProps}
          className="min-h-[320px]"
          detail={
            <>
              <ProductsBarChart data={view.topProducts} height={360} />
              <DataTable
                columns={['Product', 'Revenue']}
                rows={view.topProducts.map((row) => [row.name, formatCurrency(row.total)])}
              />
            </>
          }
        >
          <ProductsBarChart data={view.topProducts.slice(0, 5)} />
        </WidgetShell>
      );
    }
    if (id === 'categories') {
      return (
        <WidgetShell
          title="Sales by Category"
          subtitle={`Revenue share · ${periodLabel}`}
          dragHandleProps={handleProps}
          className="min-h-[320px]"
          detail={
            <>
              <CategoryDonut data={view.categorySales.slice(0, 8)} height={320} />
              <DataTable
                columns={['Category', 'Revenue', 'Share']}
                rows={view.categorySales.map((row) => [
                  row.name,
                  formatCurrency(row.total),
                  categoryShare > 0 ? `${Math.round((row.total / categoryShare) * 100)}%` : '0%',
                ])}
              />
            </>
          }
        >
          <CategoryDonut data={view.categorySales.slice(0, 6)} />
        </WidgetShell>
      );
    }
    return (
      <WidgetShell
        title="Recent Activity"
        subtitle="Approvals and system actions"
        dragHandleProps={handleProps}
        className="min-h-[320px]"
        detail={
          <>
            <ActivityList items={view.activity} limit={8} />
            <DataTable
              columns={['When', 'Action', 'Detail', 'Status']}
              rows={view.activity.slice(0, 20).map((item) => [formatWhen(item.at), item.title, item.detail, item.status])}
            />
          </>
        }
      >
        <ActivityList items={view.activity} limit={6} />
      </WidgetShell>
    );
  }

  return (
    <AppShell active="dashboard">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl dark:text-slate-100">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Drag a widget by its grip. Expand any card for the full breakdown.</p>
        </div>
        <div className="inline-flex w-full overflow-x-auto rounded-full bg-white p-1 shadow-sm ring-1 ring-gray-100 sm:w-auto dark:bg-slate-800 dark:ring-slate-700" role="group" aria-label="Date filter">
          {DATE_FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setDateFilter(option.id)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                dateFilter === option.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-100 border-t-indigo-600" />
        </div>
      ) : (
        <>
          {error ? <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">{error}</div> : null}
          <DashboardBoard render={renderWidget} />
        </>
      )}
    </AppShell>
  );
}
