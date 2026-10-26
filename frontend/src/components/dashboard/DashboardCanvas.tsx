'use client';

import { useCallback } from 'react';
import { ActivityList, CategoryDonut, KpiValue, ProductsBarChart, RevenueAreaChart } from './charts';
import { DashboardBoard, type WidgetId } from './DashboardBoard';
import { formatCurrency, formatWhen } from './metrics';
import { DataTable, WidgetShell, type DragHandleProps } from './WidgetShell';

type DashboardView = ReturnType<typeof import('./metrics').buildDashboard>;

export function DashboardCanvas({
  view,
  periodLabel,
  categoryShare,
}: {
  view: DashboardView;
  periodLabel: string;
  categoryShare: number;
}) {
  const renderWidget = useCallback(
    (id: WidgetId, handleProps: DragHandleProps) => {
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
    },
    [categoryShare, periodLabel, view],
  );

  return <DashboardBoard render={renderWidget} />;
}
