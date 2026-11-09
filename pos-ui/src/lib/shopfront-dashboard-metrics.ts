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
  reportedProfit: number | null;
  profitDelta: number | null;
  profitStatus: "matched" | "mismatch" | "incomplete" | "no_sales";
  grossMargin: number | null;
  transactionCount: number;
  fetchedAt: string | null;
};

export type ShopfrontInventoryMetrics = {
  sellableUnits: number;
  negativeStockProducts: number;
  recordCount: number;
  coveredRecordCount: number;
  incompleteRecordCount: number;
  coverage: number;
  completeness: "complete" | "partial";
  fetchedAt: string | null;
};

export const SHOPFRONT_INVENTORY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function calculateShopfrontRowProfit(row: unknown) {
  const value = object(row);
  if (!value) return null;
  const revenue = numeric(field(value, "Revenue", "revenue"));
  const cost = numeric(field(value, "Cost of Goods Sold", "cost", "Cost"));
  if (revenue === null || cost === null) return null;
  const calculatedProfit = Math.round((revenue - cost) * 100) / 100;
  const reportedProfit = numeric(field(value, "Profit", "profit"));
  const profitPercentage = revenue ? Math.round((calculatedProfit / revenue * 100) * 100) / 100 : null;
  return {
    calculatedProfit,
    reportedProfit,
    profitDelta: reportedProfit === null ? null : Math.round((calculatedProfit - reportedProfit) * 100) / 100,
    profitPercentage,
  };
}

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
  let profitMismatch = false;
  let transactions = 0;
  for (const value of rows) {
    const row = object(value);
    if (!row) return null;
    const rowRevenue = numeric(field(row, "Revenue", "revenue"));
    const rowCost = numeric(field(row, "Cost of Goods Sold", "cost", "Cost"));
    const rowTransactions = numeric(field(row, "Transaction Count", "transaction_count"));
    const rowProfit = numeric(field(row, "Profit", "profit"));
    const rowProfitPercent = numeric(field(row, "Profit Percentage", "profit_percentage"));
    if (rowRevenue === null || rowCost === null || rowTransactions === null) return null;
    revenue += rowRevenue;
    cost += rowCost;
    if (rowProfit !== null && rowProfitPercent !== null) {
      reportedProfit += rowProfit;
      const expectedProfit = Math.round((rowRevenue - rowCost) * 100) / 100;
      const expectedPercent = rowRevenue === 0 ? null : Math.round((expectedProfit / rowRevenue * 100) * 100) / 100;
      if (Math.round(rowProfit * 100) !== Math.round(expectedProfit * 100)
        || (expectedPercent !== null && Math.round(rowProfitPercent * 100) !== Math.round(expectedPercent * 100))) {
        profitMismatch = true;
      }
    }
    transactions += rowTransactions;
  }
  const calculatedProfit = revenue - cost;
  const calculatedProfitRounded = Math.round(calculatedProfit * 100) / 100;
  const reportedProfitComplete = rows.every(value => {
    const row = object(value);
    return row !== null && numeric(field(row, "Profit", "profit")) !== null
      && numeric(field(row, "Profit Percentage", "profit_percentage")) !== null;
  });
  const profitStatus = rows.length === 0 ? "no_sales"
    : !reportedProfitComplete ? "incomplete"
      : profitMismatch ? "mismatch" : "matched";
  return {
    revenue: Math.round(revenue * 100) / 100,
    cost: Math.round(cost * 100) / 100,
    calculatedProfit: calculatedProfitRounded,
    reportedProfit: reportedProfitComplete ? Math.round(reportedProfit * 100) / 100 : null,
    profitDelta: reportedProfitComplete ? Math.round((calculatedProfitRounded - reportedProfit) * 100) / 100 : null,
    profitStatus,
    grossMargin: revenue > 0 ? calculatedProfit / revenue : null,
    transactionCount: transactions,
    fetchedAt: fetchedAt(report?.fetched_at),
  };
}

export function parseShopfrontInventoryReport(payload: unknown, nowMs = Date.now()): ShopfrontInventoryMetrics | null {
  const report = object(payload);
  if (report?.available !== true || report.source !== "shopfront_reporting_api"
    || report.source_version !== "shopfront_reporting_api_v1"
    || report.freshness === "stale_fallback" || report.refresh_error != null) return null;
  if (!shopfrontInventorySnapshotIsFresh(report.snapshot_at, nowMs)) return null;
  const sellableUnits = numeric(report.sellable_units);
  const negativeStockProducts = numeric(report.negative_stock_products);
  const recordCount = numeric(report.record_count);
  if (recordCount === null) return null;
  const coveredRecordCount = numeric(report.covered_record_count) ?? recordCount;
  const incompleteRecordCount = numeric(report.incomplete_record_count) ?? Math.max(0, recordCount - coveredRecordCount);
  const coverage = numeric(report.coverage) ?? (recordCount > 0 ? coveredRecordCount / recordCount : 0);
  const completeness = report.completeness === "partial" || incompleteRecordCount > 0 ? "partial" : "complete";
  if (sellableUnits === null || negativeStockProducts === null || recordCount === null || recordCount < 0
    || coveredRecordCount === null || incompleteRecordCount === null || coverage === null
    || !Number.isSafeInteger(recordCount) || !Number.isSafeInteger(coveredRecordCount) || !Number.isSafeInteger(incompleteRecordCount)
    || coveredRecordCount <= 0 || coveredRecordCount + incompleteRecordCount !== recordCount
    || coverage <= 0 || coverage > 1 || Math.abs(coverage - coveredRecordCount / recordCount) > 0.000001
    || numeric(report.outlet_count) !== 1) return null;
  return {
    sellableUnits,
    negativeStockProducts,
    recordCount,
    coveredRecordCount,
    incompleteRecordCount,
    coverage,
    completeness,
    fetchedAt: fetchedAt(report.snapshot_at),
  };
}
