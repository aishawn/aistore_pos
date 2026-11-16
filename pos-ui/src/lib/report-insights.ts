import type { NativeOverview, NativeOverviewDaily, NativeOverviewProduct } from "@/lib/native-overview";
import { reportPercent } from "@/components/reports/report-format";

export type PeriodCompareSlice = {
  revenue: number;
  transactions: number;
  grossProfit: number | null;
  refunds: number;
  refundTransactions: number;
};

export type PeriodCompareDeltas = {
  revenuePct: number | null;
  transactionsPct: number | null;
  profitPct: number | null;
  refundsPct: number | null;
};

export type RefundAttentionLevel = "none" | "elevated" | "high";

export type PeriodTotals = {
  revenue: number;
  cost: number | null;
  profit: number | null;
  tax: number | null;
  discount: number;
  transactions: number;
  refunds: number;
  refundTransactions: number;
  costAvailable: boolean;
  taxAvailable: boolean;
};

function deltaPct(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function sliceForCompare(data: NativeOverview): PeriodCompareSlice {
  return {
    revenue: data.revenue,
    transactions: data.transactions,
    grossProfit: data.grossProfit,
    refunds: Number(data.refunds) || 0,
    refundTransactions: Number(data.refundTransactions) || 0,
  };
}

export function comparePeriod(current: PeriodCompareSlice, previous: PeriodCompareSlice): PeriodCompareDeltas {
  return {
    revenuePct: deltaPct(current.revenue, previous.revenue),
    transactionsPct: deltaPct(current.transactions, previous.transactions),
    profitPct:
      current.grossProfit != null && previous.grossProfit != null
        ? deltaPct(current.grossProfit, previous.grossProfit)
        : null,
    refundsPct: deltaPct(current.refunds, previous.refunds),
  };
}

export function buildExecutiveHeadline(
  deltas: PeriodCompareDeltas,
  costAvailable: boolean,
): string {
  if (deltas.revenuePct == null) {
    return costAvailable ? "Compare the prior period to spot profit and traffic shifts." : "Sales summary for the selected period.";
  }
  const direction = deltas.revenuePct >= 0 ? "up" : "down";
  const revenuePart = `Sales ${direction} ${Math.abs(deltas.revenuePct).toFixed(1)}% vs previous period`;
  if (deltas.transactionsPct == null) return `${revenuePart}.`;
  const txDir = deltas.transactionsPct >= 0 ? "more" : "fewer";
  const txPart = `${txDir} transactions (${reportPercent(deltas.transactionsPct)})`;
  const sameSign =
    (deltas.revenuePct >= 0 && deltas.transactionsPct >= 0) ||
    (deltas.revenuePct < 0 && deltas.transactionsPct < 0);
  if (sameSign && Math.abs(deltas.transactionsPct) >= 5) {
    return `${revenuePart} — mainly ${txPart}.`;
  }
  return `${revenuePart}; ${txPart}.`;
}

export function topProductShare(products: NativeOverviewProduct[], totalRevenue: number) {
  const base = Math.max(1, totalRevenue);
  return products.map((row) => ({
    ...row,
    sharePct: (Number(row.revenue) / base) * 100,
  }));
}

const REFUND_SHARE_THRESHOLD = 0.02;

export function refundAttentionLevel(
  grossSales: number,
  refunds: number,
  priorRefunds: number | null,
): RefundAttentionLevel {
  const sales = Math.max(0, grossSales);
  const refundTotal = Math.max(0, refunds);
  if (sales > 0 && refundTotal / sales >= REFUND_SHARE_THRESHOLD) return "high";
  if (priorRefunds != null && priorRefunds > 0 && refundTotal >= priorRefunds * 1.5) return "elevated";
  if (refundTotal > 0 && refundTotal / Math.max(sales, 1) >= 0.01) return "elevated";
  return "none";
}

export function periodTotals(days: NativeOverviewDaily[]): PeriodTotals {
  let revenue = 0;
  let cost = 0;
  let profit = 0;
  let tax = 0;
  let discount = 0;
  let transactions = 0;
  let refunds = 0;
  let refundTransactions = 0;
  let costAvailable = true;
  let taxAvailable = true;

  for (const row of days) {
    revenue += Number(row.revenue) || 0;
    discount += Number(row.discount) || 0;
    transactions += Number(row.transaction_count) || 0;
    refunds += Number(row.refundAmount) || 0;
    refundTransactions += Number(row.refundTransactions) || 0;
    if (!row.costAvailable) costAvailable = false;
    else cost += Number(row.cost) || 0;
    if (!row.taxAvailable) taxAvailable = false;
    else tax += Number(row.tax) || 0;
    if (row.grossProfit != null) profit += Number(row.grossProfit) || 0;
  }

  return {
    revenue,
    cost: costAvailable ? cost : null,
    profit: costAvailable ? profit : null,
    tax: taxAvailable ? tax : null,
    discount,
    transactions,
    refunds,
    refundTransactions,
    costAvailable,
    taxAvailable,
  };
}

export function formatDataAsOfLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Adelaide",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(parsed));
}