export interface DailySalesGroup {
  date: string;
  transactions: number;
  amount: number;
  tax: number;
}

export interface DailySalesSummary {
  date: string;
  salesTransactions: number;
  refundTransactions: number;
  salesAmount: number;
  refundAmount: number;
  netSales: number;
  tax: number;
}

const PERIOD_DAYS: Record<string, number> = { "24h": 1, "7d": 7, "30d": 30, "90d": 90, "180d": 180 };
/** Bound "all time" Shopfront history so the crawler query stays bounded. */
export const SHOPFRONT_SALES_HISTORY_MAX_DAYS = 800;

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function numeric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = Number(value.trim().replace(/[,$%\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function businessDayToday(timezone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function shiftBusinessDay(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Resolve the inclusive Shopfront business-day window for Sales History filters. */
export function shopfrontSalesHistoryWindow(options: {
  timezone: string;
  period?: string;
  fromDate?: string;
  toDate?: string;
  now?: Date;
}) {
  const today = businessDayToday(options.timezone, options.now ?? new Date());
  if (options.fromDate || options.toDate) {
    return {
      from: options.fromDate || shiftBusinessDay(options.toDate!, -(SHOPFRONT_SALES_HISTORY_MAX_DAYS - 1)),
      to: options.toDate || today,
    };
  }
  if (options.period && options.period !== "all" && Object.hasOwn(PERIOD_DAYS, options.period)) {
    const days = PERIOD_DAYS[options.period];
    return { from: shiftBusinessDay(today, -(days - 1)), to: today };
  }
  return { from: shiftBusinessDay(today, -(SHOPFRONT_SALES_HISTORY_MAX_DAYS - 1)), to: today };
}

/**
 * Map crawler `/api/reports/sales-trend` rows into the Sales History daily shape.
 * Shopfront Sales report revenue is the Dashboard SoT; refund buckets are not
 * published on this summary, so refund columns stay zero and net = revenue.
 */
export function parseShopfrontDailyTrendRow(row: Record<string, unknown>): DailySalesSummary | null {
  const date = String(row.date ?? row.business_date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return null;
  const revenue = numeric(row.revenue);
  const tax = numeric(row.tax) ?? 0;
  const transactions = numeric(row.transaction_count);
  if (revenue === null || transactions === null || !Number.isFinite(tax)) return null;
  const salesAmount = roundMoney(revenue);
  return {
    date,
    salesTransactions: Math.max(0, Math.trunc(transactions)),
    refundTransactions: 0,
    salesAmount,
    refundAmount: 0,
    netSales: salesAmount,
    tax: roundMoney(tax),
  };
}

export function mapShopfrontSalesTrend(
  rows: unknown[],
  options: { status?: string; offset?: number; limit?: number } = {},
) {
  const status = options.status ?? "all";
  if (status !== "all" && status !== "completed") {
    return { items: [] as DailySalesSummary[], total: 0 };
  }
  const items = rows
    .map((row) => (row && typeof row === "object" ? parseShopfrontDailyTrendRow(row as Record<string, unknown>) : null))
    .filter((row): row is DailySalesSummary => row !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const limit = Math.max(1, Math.floor(options.limit ?? 40));
  return { items: items.slice(offset, offset + limit), total: items.length };
}

export function mergeDailySalesGroups(groups: DailySalesGroup[]): DailySalesSummary[] {
  const merged = new Map<string, DailySalesSummary>();
  for (const group of groups) {
    const current = merged.get(group.date) ?? { date: group.date, salesTransactions: 0, refundTransactions: 0, salesAmount: 0, refundAmount: 0, netSales: 0, tax: 0 };
    if (group.amount < 0) {
      current.refundTransactions += group.transactions;
      current.refundAmount += Math.abs(group.amount);
      current.tax -= Math.abs(group.tax);
    } else {
      current.salesTransactions += group.transactions;
      current.salesAmount += group.amount;
      current.tax += group.tax;
    }
    current.netSales = current.salesAmount - current.refundAmount;
    merged.set(group.date, current);
  }
  return [...merged.values()].sort((a, b) => b.date.localeCompare(a.date));
}
