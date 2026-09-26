export type DateFilter = 'today' | 'week' | 'all';

export type OrderItem = {
  product_id: number;
  quantity: number;
  price: number;
  name: string;
};

export type OrderRow = {
  id?: number;
  total_amount: number;
  created_at: string;
  customer_phone?: string | null;
  items?: OrderItem[];
};

export type ReturnRow = {
  refund_amount: number;
  date: string;
};

export type CustomerRow = {
  customer_phone: string;
  total_visits: number;
  total_spent: number;
};

export type ApprovalRow = {
  id: number;
  entity_type: string;
  action: string;
  status: string;
  module_name?: string | null;
  action_type?: string | null;
  created_at?: string;
  payload?: { name?: string; summary?: string; code_number?: string };
};

export type AuditRow = {
  id: number;
  action_type: string;
  entity_type: string;
  entity_id?: number | null;
  method: string;
  reason?: string | null;
  created_at: string;
};

export type ActivityItem = {
  key: string;
  at: string;
  title: string;
  detail: string;
  status: string;
};

export type MonthPoint = {
  day: string;
  current: number | null;
  previous: number;
};

export type NamedTotal = {
  name: string;
  total: number;
};

export const DATE_FILTERS: { id: DateFilter; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'all', label: 'All Time' },
];

export function formatCurrency(amount: number) {
  return `৳ ${amount.toLocaleString('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatWhen(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return parsed.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date) {
  const weekday = date.getDay();
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  return startOfLocalDay(new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysFromMonday));
}

export function inRange(value: string, filter: DateFilter) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  if (filter === 'all') {
    return true;
  }
  const now = new Date();
  const start = filter === 'today' ? startOfLocalDay(now) : startOfWeek(now);
  return parsed >= start && parsed <= now;
}

function weekSpan(offset: number) {
  const start = startOfWeek(new Date());
  start.setDate(start.getDate() + offset * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

function inWeek(value: string, offset: number) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  const { start, end } = weekSpan(offset);
  return parsed >= start && parsed < end;
}

function percentChange(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }
  return ((current - previous) / previous) * 100;
}

function sameDay(value: string, day: Date) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  return parsed.getFullYear() === day.getFullYear() && parsed.getMonth() === day.getMonth() && parsed.getDate() === day.getDate();
}

export function buildMonthComparison(orders: OrderRow[]): MonthPoint[] {
  const today = new Date();
  const currentStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const previousStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const currentDays = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const previousDays = new Date(previousStart.getFullYear(), previousStart.getMonth() + 1, 0).getDate();
  const length = Math.max(currentDays, previousDays);
  const points: MonthPoint[] = Array.from({ length }, (_, index) => ({
    day: String(index + 1),
    current: index + 1 <= today.getDate() ? 0 : null,
    previous: index + 1 <= previousDays ? 0 : 0,
  }));

  for (const order of orders) {
    const parsed = new Date(order.created_at);
    if (Number.isNaN(parsed.getTime())) {
      continue;
    }
    const amount = order.total_amount || 0;
    const inCurrent = parsed >= currentStart && parsed.getMonth() === today.getMonth() && parsed.getFullYear() === today.getFullYear();
    const inPrevious = parsed.getMonth() === previousStart.getMonth() && parsed.getFullYear() === previousStart.getFullYear();
    const index = parsed.getDate() - 1;
    const point = points[index];
    if (!point) {
      continue;
    }
    if (inCurrent && point.current !== null) {
      point.current += amount;
    }
    if (inPrevious) {
      point.previous += amount;
    }
  }
  return points;
}

export function buildDashboard(input: {
  orders: OrderRow[];
  returns: ReturnRow[];
  customers: CustomerRow[];
  categories: Map<number, string>;
  dateFilter: DateFilter;
  approvals: ApprovalRow[];
  audits: AuditRow[];
}) {
  const { orders, returns, customers, categories, dateFilter, approvals, audits } = input;
  const filteredOrders = orders.filter((order) => inRange(order.created_at, dateFilter));
  const today = new Date();
  const todaysOrders = orders.filter((order) => sameDay(order.created_at, today));
  const sales = filteredOrders.reduce((total, order) => total + (order.total_amount || 0), 0);
  const phonesThisWeek = new Set(orders.filter((order) => inWeek(order.created_at, 0) && order.customer_phone).map((order) => order.customer_phone));
  const phonesLastWeek = new Set(orders.filter((order) => inWeek(order.created_at, -1) && order.customer_phone).map((order) => order.customer_phone));
  const salesThisWeek = orders.filter((order) => inWeek(order.created_at, 0)).reduce((total, order) => total + order.total_amount, 0);
  const salesLastWeek = orders.filter((order) => inWeek(order.created_at, -1)).reduce((total, order) => total + order.total_amount, 0);
  const invoicesThisWeek = orders.filter((order) => inWeek(order.created_at, 0)).length;
  const invoicesLastWeek = orders.filter((order) => inWeek(order.created_at, -1)).length;
  const returnsThisWeek = returns.filter((row) => inWeek(row.date, 0)).reduce((total, row) => total + row.refund_amount, 0);
  const returnsLastWeek = returns.filter((row) => inWeek(row.date, -1)).reduce((total, row) => total + row.refund_amount, 0);

  const productTotals = new Map<string, number>();
  const categoryTotals = new Map<string, number>();
  for (const order of filteredOrders) {
    for (const item of order.items ?? []) {
      const revenue = item.quantity * item.price;
      const name = item.name || `Product #${item.product_id}`;
      productTotals.set(name, (productTotals.get(name) ?? 0) + revenue);
      const category = categories.get(item.product_id) || 'Uncategorized';
      categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + revenue);
    }
  }

  const activity: ActivityItem[] = [
    ...approvals.map((row) => ({
      key: `approval-${row.id}`,
      at: row.created_at || '',
      title: `${row.action_type || row.action} ${row.module_name || row.entity_type.replaceAll('_', ' ')}`,
      detail: row.payload?.summary || row.payload?.name || row.payload?.code_number || 'Maker-checker request',
      status: row.status,
    })),
    ...audits.map((row) => ({
      key: `audit-${row.id}`,
      at: row.created_at,
      title: `${row.action_type} ${row.entity_type.replaceAll('_', ' ')}`,
      detail: row.reason || row.method || 'System action',
      status: row.method || 'Logged',
    })),
  ].sort((left, right) => right.at.localeCompare(left.at));

  return {
    sales,
    todaysOrders: todaysOrders.length,
    customers: customers.length,
    pendingApprovals: approvals.filter((row) => row.status === 'Pending').length,
    trends: {
      sales: percentChange(salesThisWeek, salesLastWeek),
      customers: percentChange(phonesThisWeek.size, phonesLastWeek.size),
      invoices: percentChange(invoicesThisWeek, invoicesLastWeek),
      returns: percentChange(returnsThisWeek, returnsLastWeek),
    },
    monthComparison: buildMonthComparison(orders),
    topProducts: [...productTotals.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 10)
      .map(([name, total]) => ({ name, total })),
    categorySales: [...categoryTotals.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([name, total]) => ({ name, total })),
    recentOrders: [...filteredOrders]
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .slice(0, 12),
    todaysOrderRows: todaysOrders,
    customerRows: customers,
    pendingRows: approvals.filter((row) => row.status === 'Pending'),
    activity,
  };
}
