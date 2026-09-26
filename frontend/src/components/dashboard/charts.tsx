'use client';

import { ArrowDownRight, ArrowUpRight, ClipboardCheck, ShoppingBag, Users, Wallet } from 'lucide-react';
import { useId } from 'react';
import { useTheme } from 'next-themes';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrency, type ActivityItem, type MonthPoint, type NamedTotal } from './metrics';

const DONUT_COLORS = ['#4f46e5', '#818cf8', '#22c55e', '#f59e0b', '#f43f5e', '#94a3b8'];

function useChartTheme() {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  return {
    grid: dark ? '#475569' : '#cbd5e1',
    tick: dark ? '#94a3b8' : '#64748b',
    tooltip: {
      backgroundColor: dark ? '#1e293b' : '#ffffff',
      border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
      borderRadius: 16,
      color: dark ? '#f1f5f9' : '#0f172a',
      fontSize: 13,
    },
  };
}

function Empty({ label }: { label: string }) {
  return (
    <div className="flex h-52 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
      {label}
    </div>
  );
}

export function KpiValue({
  value,
  trend,
  hint,
  icon,
  invert = false,
}: {
  value: string;
  trend?: number;
  hint: string;
  icon: 'revenue' | 'orders' | 'customers' | 'approvals';
  invert?: boolean;
}) {
  const glyphs = {
    revenue: Wallet,
    orders: ShoppingBag,
    customers: Users,
    approvals: ClipboardCheck,
  };
  const Icon = glyphs[icon];
  const positive = trend === undefined ? true : invert ? trend <= 0 : trend >= 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{value}</p>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
          <Icon className="h-4 w-4" strokeWidth={1.5} />
        </span>
      </div>
      {trend === undefined ? (
        <p className="mt-3 text-xs font-medium text-slate-500 dark:text-slate-400">{hint}</p>
      ) : (
        <p className={`mt-3 inline-flex items-center gap-1 text-xs font-medium ${positive ? 'text-emerald-600' : 'text-rose-600'}`}>
          {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {trend > 0 ? '+' : ''}
          {trend.toFixed(0)}% {hint}
        </p>
      )}
    </div>
  );
}

export function RevenueAreaChart({ data, height = 240 }: { data: MonthPoint[]; height?: number }) {
  const theme = useChartTheme();
  const gradientId = useId().replace(/:/g, '');
  const hasSales = data.some((point) => (point.current ?? 0) > 0 || point.previous > 0);
  if (!hasSales) {
    return <Empty label="No sales this month or last month." />;
  }
  return (
    <div className="w-full min-w-0" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={theme.grid} strokeDasharray="4 4" vertical={false} />
          <XAxis dataKey="day" tick={{ fill: theme.tick, fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis
            tickFormatter={(value: number) => `৳ ${Number(value).toLocaleString('en-BD', { maximumFractionDigits: 0 })}`}
            tick={{ fill: theme.tick, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={68}
          />
          <Tooltip
            formatter={(value, name) => [formatCurrency(Number(value ?? 0)), String(name)]}
            labelFormatter={(label) => `Day ${label}`}
            contentStyle={theme.tooltip}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: theme.tick }} />
          <Area type="monotone" dataKey="current" name="This month" stroke="#4f46e5" fill={`url(#${gradientId})`} strokeWidth={2.5} connectNulls={false} />
          <Area type="monotone" dataKey="previous" name="Last month" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.12} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProductsBarChart({ data, height = 240 }: { data: NamedTotal[]; height?: number }) {
  const theme = useChartTheme();
  if (data.length === 0) {
    return <Empty label="No product sales yet." />;
  }
  return (
    <div className="w-full min-w-0" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
          <CartesianGrid stroke={theme.grid} strokeDasharray="4 4" horizontal={false} />
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={120} tick={{ fill: theme.tick, fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(value) => [formatCurrency(Number(value ?? 0)), 'Revenue']} contentStyle={theme.tooltip} />
          <Bar dataKey="total" fill="#6366f1" radius={[0, 8, 8, 0]} barSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryDonut({ data, height = 220 }: { data: NamedTotal[]; height?: number }) {
  const theme = useChartTheme();
  const total = data.reduce((sum, entry) => sum + entry.total, 0);
  if (data.length === 0) {
    return <Empty label="No category sales yet." />;
  }
  return (
    <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_150px]">
      <div className="w-full min-w-0" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="total" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={3} stroke="none">
              {data.map((entry, index) => (
                <Cell key={entry.name} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value, name) => [formatCurrency(Number(value ?? 0)), String(name)]} contentStyle={theme.tooltip} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-2 text-sm">
        {data.slice(0, 6).map((entry, index) => (
          <li key={entry.name} className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }} />
            <span className="truncate">{entry.name}</span>
            <span className="ml-auto text-xs text-slate-400">{total > 0 ? `${Math.round((entry.total / total) * 100)}%` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ActivityList({ items, limit }: { items: ActivityItem[]; limit?: number }) {
  const rows = limit ? items.slice(0, limit) : items;
  if (rows.length === 0) {
    return <Empty label="No approvals or system actions yet." />;
  }
  return (
    <ul className="space-y-1">
      {rows.map((item) => (
        <li key={item.key} className="flex items-start justify-between gap-3 rounded-xl px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{item.title}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{item.detail}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[11px] font-medium text-indigo-600 dark:text-indigo-300">{item.status}</p>
            <p className="text-[11px] text-slate-400">{item.at ? new Date(item.at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : ''}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
