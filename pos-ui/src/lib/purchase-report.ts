/** Shopfront-aligned Purchase report column keys (Orithos native ledger). */
export const PURCHASE_REPORT_COLUMNS = [
  { key: "name", label: "Name" },
  { key: "orderCount", label: "Orders" },
  { key: "totalCost", label: "Total Cost" },
  { key: "fees", label: "Fees" },
  { key: "freight", label: "Freight" },
  { key: "paymentFees", label: "Payment Fees" },
  { key: "taxAmount", label: "Tax Amount" },
] as const;

export type PurchaseColumnKey = (typeof PURCHASE_REPORT_COLUMNS)[number]["key"];
export type PurchaseGroupBy = "outlet" | "supplier" | "none";
export type PurchaseSort = PurchaseColumnKey;
export type PurchaseSortDirection = "asc" | "desc";

/** Default visible columns match Shopfront /reports/purchase (Orders optional). */
export const DEFAULT_PURCHASE_COLUMNS: PurchaseColumnKey[] = [
  "name",
  "totalCost",
  "fees",
  "freight",
  "paymentFees",
  "taxAmount",
];

export const PURCHASE_REPORT_TYPES = [
  { value: "outlet", label: "Outlet" },
  { value: "supplier", label: "Supplier" },
  { value: "none", label: "All purchases" },
] as const;

export type PurchaseReportRow = {
  id?: number | null;
  name: string;
  orderCount: number;
  totalCost: number;
  fees: number | null;
  freight: number | null;
  paymentFees: number | null;
  taxAmount: number | null;
  feesAvailable: boolean;
  freightAvailable: boolean;
  paymentFeesAvailable: boolean;
  taxAvailable: boolean;
};

export type PurchaseFooterTotals = {
  orderCount: number;
  totalCost: number;
  fees: number | null;
  freight: number | null;
  paymentFees: number | null;
  taxAmount: number | null;
};

export function isPurchaseGroupBy(value: string | null | undefined): value is PurchaseGroupBy {
  return value === "outlet" || value === "supplier" || value === "none";
}

export function purchaseReportTypeLabel(value: PurchaseGroupBy) {
  return PURCHASE_REPORT_TYPES.find((entry) => entry.value === value)?.label ?? "Outlet";
}

export function filterPurchaseRows(rows: PurchaseReportRow[], query: string): PurchaseReportRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => row.name.toLowerCase().includes(needle));
}

function sortValue(row: PurchaseReportRow, key: PurchaseSort): string | number | null {
  switch (key) {
    case "name":
      return row.name.toLowerCase();
    case "orderCount":
      return row.orderCount;
    case "totalCost":
      return row.totalCost;
    case "fees":
      return row.feesAvailable ? row.fees : null;
    case "freight":
      return row.freightAvailable ? row.freight : null;
    case "paymentFees":
      return row.paymentFeesAvailable ? row.paymentFees : null;
    case "taxAmount":
      return row.taxAvailable ? row.taxAmount : null;
    default:
      return null;
  }
}

export function sortPurchaseRows(
  rows: PurchaseReportRow[],
  sortBy: PurchaseSort,
  direction: PurchaseSortDirection,
): PurchaseReportRow[] {
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const a = sortValue(left, sortBy);
    const b = sortValue(right, sortBy);
    if (a == null && b == null) return left.name.localeCompare(right.name);
    if (a == null) return 1;
    if (b == null) return -1;
    if (typeof a === "string" && typeof b === "string") {
      const cmp = a.localeCompare(b);
      return cmp === 0 ? left.name.localeCompare(right.name) : cmp * factor;
    }
    const cmp = Number(a) - Number(b);
    return cmp === 0 ? left.name.localeCompare(right.name) : cmp * factor;
  });
}

export function purchaseFooterTotals(rows: PurchaseReportRow[]): PurchaseFooterTotals {
  let orderCount = 0;
  let totalCost = 0;
  let feesSum = 0;
  let freightSum = 0;
  let paymentFeesSum = 0;
  let taxSum = 0;
  let feesAvailable = false;
  let freightAvailable = false;
  let paymentFeesAvailable = false;
  let taxAvailable = false;
  for (const row of rows) {
    orderCount += Number(row.orderCount) || 0;
    totalCost += Number(row.totalCost) || 0;
    if (row.feesAvailable && row.fees != null) {
      feesAvailable = true;
      feesSum += Number(row.fees) || 0;
    }
    if (row.freightAvailable && row.freight != null) {
      freightAvailable = true;
      freightSum += Number(row.freight) || 0;
    }
    if (row.paymentFeesAvailable && row.paymentFees != null) {
      paymentFeesAvailable = true;
      paymentFeesSum += Number(row.paymentFees) || 0;
    }
    if (row.taxAvailable && row.taxAmount != null) {
      taxAvailable = true;
      taxSum += Number(row.taxAmount) || 0;
    }
  }
  return {
    orderCount,
    totalCost,
    fees: feesAvailable ? feesSum : null,
    freight: freightAvailable ? freightSum : null,
    paymentFees: paymentFeesAvailable ? paymentFeesSum : null,
    taxAmount: taxAvailable ? taxSum : null,
  };
}
