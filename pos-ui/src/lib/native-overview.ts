import { fetchOrithosApi } from "@/lib/orithos-api-fetch";

export type ReportDataStatus = "available" | "incomplete" | "no_data";

export type NativeOverviewDaily = {
  date: string;
  revenue: number;
  salesAmount?: number | null;
  refundAmount?: number | null;
  refundTransactions?: number;
  transaction_count: number;
  cost: number | null;
  tax: number | null;
  discount: number | null;
  grossProfit: number | null;
  profitMargin?: number | null;
  costAvailable: boolean;
  taxAvailable: boolean;
};

export type NativeOverviewProduct = {
  id?: number | string;
  name: string;
  revenue: number;
  quantity: number;
};

export type NativeOverview = {
  source: "orithos_ledger";
  from: string;
  to: string;
  revenue: number;
  grossSales?: number | null;
  refunds?: number | null;
  refundTransactions?: number;
  netRevenue?: number | null;
  cost: number | null;
  tax: number | null;
  discount: number | null;
  grossProfit: number | null;
  profitMargin: number | null;
  averageSale: number | null;
  costAvailable: boolean;
  taxAvailable: boolean;
  transactions: number;
  dataAsOf?: string | null;
  reportDataStatus?: ReportDataStatus | null;
  dailyTrend: NativeOverviewDaily[];
  topProducts: NativeOverviewProduct[];
  inventoryAvailable?: boolean;
  inventoryUnits?: number | null;
  inventoryCaseLevel?: number | null;
  inventoryItemLevel?: number | null;
  inventoryStatus?: string | null;
  negativeStockProducts?: number | null;
};

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numOrNull(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDaily(row: Record<string, unknown>): NativeOverviewDaily {
  return {
    date: String(row.date ?? ""),
    revenue: num(row.revenue),
    salesAmount: numOrNull(row.salesAmount),
    refundAmount: numOrNull(row.refundAmount),
    refundTransactions: num(row.refundTransactions ?? row.refund_transaction_count),
    transaction_count: num(row.transaction_count),
    cost: numOrNull(row.cost),
    tax: numOrNull(row.tax),
    discount: numOrNull(row.discount),
    grossProfit: numOrNull(row.grossProfit),
    profitMargin: numOrNull(row.profitMargin),
    costAvailable: Boolean(row.costAvailable),
    taxAvailable: Boolean(row.taxAvailable),
  };
}

export function normalizeNativeOverview(raw: Record<string, unknown>): NativeOverview | null {
  if (raw.source !== "orithos_ledger") return null;
  const daily = Array.isArray(raw.dailyTrend)
    ? raw.dailyTrend.map((row) => normalizeDaily(row as Record<string, unknown>))
    : [];
  const topProducts = Array.isArray(raw.topProducts)
    ? raw.topProducts.map((row) => {
        const item = row as Record<string, unknown>;
        return {
          id: item.id as number | string | undefined,
          name: String(item.name ?? "Unknown product"),
          revenue: num(item.revenue),
          quantity: num(item.quantity),
        };
      })
    : [];
  const status = raw.reportDataStatus;
  const reportDataStatus: ReportDataStatus | null =
    status === "available" || status === "incomplete" || status === "no_data" ? status : null;

  return {
    source: "orithos_ledger",
    from: String(raw.from ?? ""),
    to: String(raw.to ?? ""),
    revenue: num(raw.revenue),
    grossSales: numOrNull(raw.grossSales),
    refunds: numOrNull(raw.refunds),
    refundTransactions: num(raw.refundTransactions),
    netRevenue: numOrNull(raw.netRevenue),
    cost: numOrNull(raw.cost),
    tax: numOrNull(raw.tax),
    discount: numOrNull(raw.discount),
    grossProfit: numOrNull(raw.grossProfit),
    profitMargin: numOrNull(raw.profitMargin),
    averageSale: numOrNull(raw.averageSale),
    costAvailable: Boolean(raw.costAvailable),
    taxAvailable: Boolean(raw.taxAvailable),
    transactions: num(raw.transactions),
    dataAsOf: raw.dataAsOf == null ? null : String(raw.dataAsOf),
    reportDataStatus,
    dailyTrend: daily,
    topProducts,
    inventoryAvailable: raw.inventoryAvailable == null ? undefined : Boolean(raw.inventoryAvailable),
    inventoryUnits: numOrNull(raw.inventoryUnits),
    inventoryCaseLevel: numOrNull(raw.inventoryCaseLevel),
    inventoryItemLevel: numOrNull(raw.inventoryItemLevel),
    inventoryStatus: raw.inventoryStatus == null ? null : String(raw.inventoryStatus),
    negativeStockProducts: numOrNull(raw.negativeStockProducts),
  };
}

export async function fetchNativeOverview(from: string, to: string, signal?: AbortSignal): Promise<NativeOverview> {
  const params = new URLSearchParams({ from, to });
  const response = await fetchOrithosApi(`/reports/native-overview?${params}`, { signal });
  const body = await response.json().catch(() => null) as { data?: Record<string, unknown>; message?: string } | null;
  const data = body?.data ? normalizeNativeOverview(body.data) : null;
  if (!response.ok || !data) {
    throw new Error(body?.message || "Orithos sales data is unavailable.");
  }
  return data;
}