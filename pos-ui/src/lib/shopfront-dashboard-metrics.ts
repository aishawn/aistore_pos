type RecordValue = Record<string, unknown>;

function object(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

function numeric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  const negative = text.startsWith("(") && text.endsWith(")");
  const parsed = Number(text.replace(/[,$%()\s]/g, ""));
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null;
}

function field(row: RecordValue, ...names: string[]): unknown {
  for (const name of names) if (Object.hasOwn(row, name)) return row[name];
  return undefined;
}

export type ShopfrontSalesMetrics = {
  revenue: number;
  cost: number;
  calculatedProfit: number;
  reportedProfit: number;
  profitDelta: number;
  grossMargin: number | null;
  transactionCount: number;
  fetchedAt: string | null;
};

export type ShopfrontInventoryMetrics = {
  sellableUnits: number;
  negativeStockProducts: number;
  recordCount: number;
  fetchedAt: string | null;
};

export const SHOPFRONT_INVENTORY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function shopfrontInventorySnapshotIsFresh(value: unknown, nowMs = Date.now()): boolean {
  const timestamp = fetchedAt(value);
  if (!timestamp) return false;
  const snapshotMs = Date.parse(timestamp);
  const ageMs = nowMs - snapshotMs;
  return Number.isFinite(snapshotMs) && ageMs >= -5 * 60 * 1000 && ageMs <= SHOPFRONT_INVENTORY_MAX_AGE_MS;
}

export function reconcileShopfrontSales(
  source: ShopfrontSalesMetrics | null,
  odooRevenue: number,
  odooTransactions: number,
): "matched" | "mismatch" | "unavailable" {
  if (!source || !Number.isFinite(odooRevenue) || !Number.isFinite(odooTransactions)) return "unavailable";
  return Math.abs(source.revenue - odooRevenue) <= 0.01 && source.transactionCount === odooTransactions
    ? "matched"
    : "mismatch";
}

function fetchedAt(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`;
}

export function parseShopfrontSalesReport(payload: unknown): ShopfrontSalesMetrics | null {
  const report = object(payload);
  const pagination = object(report?.pagination);
  const rows = report?.data;
  if (!Array.isArray(rows) || !pagination || typeof pagination.total !== "number" || !Number.isSafeInteger(pagination.total)
    || pagination.returned !== rows.length || pagination.total !== rows.length) return null;

  let revenue = 0;
  let cost = 0;
  let reportedProfit = 0;
  let transactions = 0;
  for (const value of rows) {
    const row = object(value);
    if (!row) return null;
    const rowRevenue = numeric(field(row, "Revenue", "revenue"));
    const rowCost = numeric(field(row, "Cost of Goods Sold", "cost", "Cost"));
    const rowTransactions = numeric(field(row, "Transaction Count", "transaction_count"));
    const rowProfit = numeric(field(row, "Profit", "profit"));
    const rowProfitPercent = numeric(field(row, "Profit Percentage", "profit_percentage"));
    if (rowRevenue === null || rowCost === null || rowTransactions === null || rowProfit === null || rowProfitPercent === null
      || Math.abs(rowProfit - (rowRevenue - rowCost)) > 0.021
      || (rowRevenue !== 0 && Math.abs(rowProfitPercent - (rowProfit / rowRevenue * 100)) > 0.021)) return null;
    revenue += rowRevenue;
    cost += rowCost;
    reportedProfit += rowProfit;
    transactions += rowTransactions;
  }
  const calculatedProfit = revenue - cost;
  return {
    revenue: Math.round(revenue * 100) / 100,
    cost: Math.round(cost * 100) / 100,
    calculatedProfit: Math.round(calculatedProfit * 100) / 100,
    reportedProfit: Math.round(reportedProfit * 100) / 100,
    profitDelta: Math.round((calculatedProfit - reportedProfit) * 100) / 100,
    grossMargin: revenue > 0 ? calculatedProfit / revenue : null,
    transactionCount: transactions,
    fetchedAt: fetchedAt(report?.fetched_at),
  };
}

export function parseShopfrontInventoryReport(payload: unknown, nowMs = Date.now()): ShopfrontInventoryMetrics | null {
  const report = object(payload);
  if (report?.available !== true || report.source !== "shopfront_reporting_api"
    || report.source_version !== "shopfront_reporting_api_v1") return null;
  if (!shopfrontInventorySnapshotIsFresh(report.snapshot_at, nowMs)) return null;
  const sellableUnits = numeric(report.sellable_units);
  const negativeStockProducts = numeric(report.negative_stock_products);
  const recordCount = numeric(report.record_count);
  if (sellableUnits === null || negativeStockProducts === null || recordCount === null || recordCount < 0
    || numeric(report.outlet_count) !== 1) return null;
  return {
    sellableUnits,
    negativeStockProducts,
    recordCount,
    fetchedAt: fetchedAt(report.snapshot_at),
  };
}
