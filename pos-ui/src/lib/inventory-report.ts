import { friendlyProductName } from "./product-display-name.ts";

export const INVENTORY_SORTS = ["name", "category", "qty_available", "shopfront_quantity", "price_included"] as const;
export type InventorySort = typeof INVENTORY_SORTS[number];
export type InventoryDirection = "asc" | "desc";

/** Shopfront Inventory On Hand column keys (Orithos native report). */
export const ON_HAND_COLUMNS = [
  { key: "name", label: "Name" },
  { key: "caseQuantity", label: "Case Quantity" },
  { key: "caseLevel", label: "Case Level" },
  { key: "itemLevel", label: "Item Level" },
  { key: "valueIncLast", label: "Value (Inc) (Last)" },
  { key: "category", label: "Category" },
  { key: "brand", label: "Brand" },
  { key: "status", label: "Status" },
] as const;

export type OnHandColumnKey = (typeof ON_HAND_COLUMNS)[number]["key"];
export const ON_HAND_SORTS = ["name", "caseQuantity", "caseLevel", "itemLevel", "valueIncLast", "category", "brand", "status"] as const;
export type OnHandSort = (typeof ON_HAND_SORTS)[number];
export type OnHandGroupBy = "none" | "category" | "brand";

/** Shopfront Inventory On Hand report-type filter. */
export const ON_HAND_REPORT_TYPES = [
  { value: "on-hand", label: "Inventory on Hand" },
  { value: "no-inventory", label: "No Inventory" },
  { value: "not-zero", label: "Not Zero Inventory" },
  { value: "only-zero", label: "Only Zero Inventory" },
  { value: "all", label: "All Inventory Levels" },
] as const;
export type OnHandReportType = (typeof ON_HAND_REPORT_TYPES)[number]["value"];

export interface OnHandFooterTotals {
  caseLevel: number;
  itemLevel: number;
  valueIncLast: number;
}

export interface OnHandProductSource {
  id: number | string;
  name: string;
  categoryName?: string | null;
  brandName?: string | null;
  status?: string | null;
  caseQuantity?: number | null;
  stockQuantity?: number | null;
  cost?: number | null;
  deletedAt?: string | null;
}

export interface OnHandRow {
  id: string;
  name: string;
  categoryName: string;
  brandName: string;
  status: string;
  deleted: boolean;
  caseQuantity: number | null;
  caseLevel: number | null;
  itemLevel: number | null;
  valueIncLast: number | null;
  stockQuantity: number | null;
}

/**
 * Split total item units into Shopfront-style case / item levels.
 * Uses trunc so negative stock keeps the same sign on the remainder.
 */
export function splitCaseItemLevels(
  stockQuantity?: number | null,
  caseQuantity?: number | null,
): { caseLevel: number | null; itemLevel: number | null } {
  if (stockQuantity == null) return { caseLevel: null, itemLevel: null };
  const stock = Number(stockQuantity);
  const caseQty = Number(caseQuantity);
  if (!Number.isFinite(stock)) return { caseLevel: null, itemLevel: null };
  if (!Number.isFinite(caseQty) || caseQty <= 0) return { caseLevel: 0, itemLevel: stock };
  const caseLevel = Object.is(Math.trunc(stock / caseQty), -0) ? 0 : Math.trunc(stock / caseQty);
  return { caseLevel, itemLevel: stock - caseLevel * caseQty };
}

/**
 * Shopfront Value (Inc) (Last) = case_cost × (case_level + item_level / case_qty).
 * Orithos `cost` is unit cost, so value = unit_cost × stock_quantity.
 */
export function inventoryValueIncLast(
  stockQuantity?: number | null,
  unitCost?: number | null,
): number | null {
  if (stockQuantity == null || unitCost == null) return null;
  const stock = Number(stockQuantity);
  const cost = Number(unitCost);
  if (!Number.isFinite(stock) || !Number.isFinite(cost)) return null;
  return Math.round(stock * cost * 100) / 100;
}

export function toOnHandRow(product: OnHandProductSource): OnHandRow {
  const caseQuantity = Number(product.caseQuantity);
  const normalizedCaseQty = Number.isFinite(caseQuantity) && caseQuantity > 0 ? caseQuantity : null;
  const stockQuantity = product.stockQuantity == null || !Number.isFinite(Number(product.stockQuantity))
    ? null
    : Number(product.stockQuantity);
  const { caseLevel, itemLevel } = splitCaseItemLevels(stockQuantity, normalizedCaseQty);
  const status = product.deletedAt ? "DELETED" : (product.status || "ACTIVE");
  return {
    id: String(product.id),
    name: product.name,
    categoryName: product.categoryName?.trim() || "Uncategorised",
    brandName: product.brandName?.trim() || "No brand",
    status,
    deleted: Boolean(product.deletedAt) || status === "DELETED" || status === "INACTIVE" || status === "ARCHIVED",
    caseQuantity: normalizedCaseQty,
    caseLevel,
    itemLevel,
    valueIncLast: inventoryValueIncLast(stockQuantity, product.cost),
    stockQuantity,
  };
}

export function sortOnHandRows(rows: OnHandRow[], sort: OnHandSort, direction: InventoryDirection): OnHandRow[] {
  const collator = new Intl.Collator("en-AU", { numeric: true, sensitivity: "base" });
  return [...rows].sort((a, b) => {
    let order = 0;
    if (sort === "name" || sort === "category" || sort === "brand" || sort === "status") {
      const left = sort === "name" ? friendlyProductName(a.name) : sort === "category" ? a.categoryName : sort === "brand" ? a.brandName : a.status;
      const right = sort === "name" ? friendlyProductName(b.name) : sort === "category" ? b.categoryName : sort === "brand" ? b.brandName : b.status;
      order = collator.compare(left, right);
    } else {
      const left = a[sort];
      const right = b[sort];
      if (typeof left !== "number" || !Number.isFinite(left)) return typeof right === "number" && Number.isFinite(right) ? 1 : collator.compare(a.id, b.id);
      if (typeof right !== "number" || !Number.isFinite(right)) return -1;
      order = left - right;
    }
    return (direction === "desc" ? -order : order) || collator.compare(a.id, b.id);
  });
}

export function groupOnHandRows(rows: OnHandRow[], groupBy: OnHandGroupBy): Array<{ key: string; label: string; rows: OnHandRow[] }> {
  if (groupBy === "none") return [{ key: "all", label: "", rows }];
  const groups = new Map<string, OnHandRow[]>();
  for (const row of rows) {
    const label = groupBy === "category" ? row.categoryName : row.brandName;
    const bucket = groups.get(label) ?? [];
    bucket.push(row);
    groups.set(label, bucket);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "en-AU", { numeric: true, sensitivity: "base" }))
    .map(([label, groupRows]) => ({ key: label, label, rows: groupRows }));
}

/** Filter loaded on-hand rows by Shopfront report-type semantics. */
export function filterOnHandRows(rows: OnHandRow[], reportType: OnHandReportType): OnHandRow[] {
  if (reportType === "all" || reportType === "on-hand") return rows;
  return rows.filter((row) => {
    const stock = row.stockQuantity;
    const hasStock = stock != null && Number.isFinite(stock);
    switch (reportType) {
      case "no-inventory":
        return !hasStock;
      case "not-zero":
        return hasStock && stock !== 0;
      case "only-zero":
        return hasStock && stock === 0;
      default:
        return true;
    }
  });
}

/** Footer totals aligned under Case Level / Item Level / Value columns. */
export function onHandFooterTotals(rows: OnHandRow[]): OnHandFooterTotals {
  let caseLevel = 0;
  let itemLevel = 0;
  let valueIncLast = 0;
  for (const row of rows) {
    if (Number.isFinite(Number(row.caseLevel))) caseLevel += Number(row.caseLevel);
    if (Number.isFinite(Number(row.itemLevel))) itemLevel += Number(row.itemLevel);
    if (Number.isFinite(Number(row.valueIncLast))) valueIncLast += Number(row.valueIncLast);
  }
  return {
    caseLevel,
    itemLevel,
    valueIncLast: Math.round(valueIncLast * 100) / 100,
  };
}

/** Map `/api/products/on-hand-summary` payload into footer totals (full catalog). */
export function onHandSummaryToTotals(summary: {
  caseLevelTotal?: number | string | null;
  itemLevelTotal?: number | string | null;
  valueIncLastTotal?: number | string | null;
} | null | undefined): OnHandFooterTotals {
  const read = (value: number | string | null | undefined) => {
    if (value == null || value === "") return 0;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    caseLevel: read(summary?.caseLevelTotal),
    itemLevel: read(summary?.itemLevelTotal),
    valueIncLast: Math.round(read(summary?.valueIncLastTotal) * 100) / 100,
  };
}

/** Server inventoryLevel for report types that need SQL filtering. */
export function inventoryLevelParam(reportType: OnHandReportType): string | undefined {
  if (reportType === "not-zero" || reportType === "only-zero" || reportType === "no-inventory") {
    return reportType;
  }
  return undefined;
}

export interface InventoryRow {
  id: number;
  name: string;
  display_name?: string;
  product_tmpl_id?: [number, string] | false;
  qty_available: number;
  standard_price?: number | false;
  price_included?: number | null;
  pos_categ_ids: number[];
  uom_id: [number, string] | false;
  [key: string]: unknown;
}

export interface InventoryTotals {
  totalItems: number;
  totalQty: number | null;
  negativeStockItems: number;
  totalStockValue: number | null;
  missingCostItems: number;
  mixedUnits: boolean;
}

function decimal(value: number): { units: bigint; scale: number } {
  const [coefficient, exponent = "0"] = value.toString().split("e");
  const [whole, fraction = ""] = coefficient.split(".");
  const scale = fraction.length - Number(exponent);
  const units = BigInt(whole + fraction);
  return scale < 0 ? { units: units * BigInt(10) ** BigInt(-scale), scale: 0 } : { units, scale };
}

export function inventoryTotals(rows: InventoryRow[]): InventoryTotals {
  let totalQty = 0;
  let valueUnits = BigInt(0);
  let valueScale = 0;
  let missingCostItems = 0;
  let negativeStockItems = 0;
  const units = new Set(rows.map((row) => row.uom_id ? row.uom_id[0] : "unknown"));
  for (const row of rows) {
    if (!Number.isFinite(row.qty_available)) throw new Error("Inventory quantities are unavailable.");
    totalQty += Math.max(row.qty_available, 0);
    if (row.qty_available < 0) negativeStockItems += 1;
    if (typeof row.standard_price !== "number" || !Number.isFinite(row.standard_price)) {
      if (row.qty_available !== 0) missingCostItems += 1;
    } else {
      const qty = decimal(row.qty_available);
      const cost = decimal(row.standard_price);
      const scale = qty.scale + cost.scale;
      const commonScale = Math.max(scale, valueScale);
      valueUnits = valueUnits * BigInt(10) ** BigInt(commonScale - valueScale) + qty.units * cost.units * BigInt(10) ** BigInt(commonScale - scale);
      valueScale = commonScale;
    }
  }
  // Round the complete decimal sum once to cents, including negative stock value.
  const divisor = BigInt(10) ** BigInt(Math.max(0, valueScale - 2));
  const magnitude = valueUnits < BigInt(0) ? -valueUnits : valueUnits;
  const cents = valueScale <= 2 ? magnitude * BigInt(10) ** BigInt(2 - valueScale) : (magnitude + divisor / BigInt(2)) / divisor;
  const totalStockValue = Number(valueUnits < BigInt(0) ? -cents : cents) / 100;
  if (!Number.isSafeInteger(Number(cents))) throw new Error("Inventory value is too large to display accurately.");
  return {
    totalItems: rows.length,
    totalQty: units.size > 1 ? null : totalQty,
    negativeStockItems,
    totalStockValue: missingCostItems ? null : totalStockValue,
    missingCostItems,
    mixedUnits: units.size > 1,
  };
}

/** Sort the complete server result before slicing; computed Odoo fields cannot use SQL order. */
export function sortInventory<T extends InventoryRow>(rows: T[], sort: InventorySort, direction: InventoryDirection, categories: Map<number, string>): T[] {
  const collator = new Intl.Collator("en-AU", { numeric: true, sensitivity: "base" });
  const category = (row: T) => row.pos_categ_ids.map((id) => categories.get(id) ?? `Category #${id}`).join(", ") || "Uncategorised";
  const labels = new Map(rows.map((row) => [row.id, sort === "category" ? category(row) : friendlyProductName(row.display_name || row.name)]));
  return [...rows].sort((a, b) => {
    let order = 0;
    if (sort === "name" || sort === "category") order = collator.compare(labels.get(a.id)!, labels.get(b.id)!);
    else {
      const left = a[sort];
      const right = b[sort];
      // Unknown tax quotes always follow known prices, in either direction.
      if (typeof left !== "number" || !Number.isFinite(left)) return typeof right === "number" && Number.isFinite(right) ? 1 : a.id - b.id;
      if (typeof right !== "number" || !Number.isFinite(right)) return -1;
      order = left - right;
    }
    return (direction === "desc" ? -order : order) || a.id - b.id;
  });
}
