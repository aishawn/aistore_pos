import type { InventoryHistoryStatus } from "@/types/inventory-history";

export function inventoryHistoryHasQualityGaps(history?: InventoryHistoryStatus | null): boolean {
  if (!history) return false;

  return Object.values(history.missingFields ?? {}).some((count) => Number.isFinite(count) && count > 0)
    || (history.missingWarehouseQuantityFields ?? 0) > 0
    || (history.gapDays ?? 0) > 0
    || (history.invalidSnapshots ?? 0) > 0
    || (history.supplierLeadTimeCoverage?.productsMissingLeadTime ?? 0) > 0;
}

export function inventoryHistoryNeedsAttention(history?: InventoryHistoryStatus | null): boolean {
  return !history || history.status !== "FRESH" || inventoryHistoryHasQualityGaps(history);
}

export function inventoryHistoryHasDailySamples(history?: InventoryHistoryStatus | null): boolean {
  return Boolean(history?.firstBusinessDate && history.latestBusinessDate
    && typeof history.observedDays === "number" && history.observedDays > 0);
}

export function inventoryHistoryFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    availableQty: "negative on-hand stock",
    virtualAvailableQty: "forecast stock",
    incomingQty: "incoming stock",
    outgoingQty: "outgoing stock",
    cost: "cost",
    leadTimeDays: "supplier lead time",
    staleInventory: "stale or unverified stock records",
    outletInventoryAnomalies: "cross-outlet, unmapped or missing stock records",
  };
  return labels[field] ?? field;
}
