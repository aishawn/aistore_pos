import { friendlyProductName } from "./product-display-name.ts";

export const INVENTORY_SORTS = ["name", "category", "qty_available", "price_included"] as const;
export type InventorySort = typeof INVENTORY_SORTS[number];
export type InventoryDirection = "asc" | "desc";

export interface InventoryRow {
  id: number;
  name: string;
  display_name?: string;
  qty_available: number;
  standard_price?: number | false;
  price_included?: number | null;
  pos_categ_ids: number[];
  uom_id: [number, string] | false;
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
