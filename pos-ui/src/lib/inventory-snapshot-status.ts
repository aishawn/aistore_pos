import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type InventorySnapshotStatus = {
  status: "UNAVAILABLE" | "FRESH" | "STALE" | "REVIEW";
  lastSuccessAt?: string;
  latestBusinessDate?: string;
  firstBusinessDate?: string;
  lastAttemptAt?: string;
  lastAttemptStatus?: string;
  businessTimezone?: string;
  expectedProducts?: number;
  capturedProducts?: number;
  productCoverage?: number;
  expectedWarehouses?: number;
  capturedWarehouses?: number;
  missingFields?: Record<string, number>;
  missingWarehouseQuantityFields?: number;
  observedDays?: number;
  gapDays?: number;
  invalidSnapshots?: number;
  supplierLeadTimeCoverage?: {
    quality?: string;
    supplierInfoRows?: number | null;
    productsWithLeadTime?: number;
    productsMissingLeadTime?: number;
  };
};

export function isTrustedSnapshotTimezone(status: InventorySnapshotStatus): boolean {
  if (status.status !== "FRESH" || typeof status.businessTimezone !== "string") return false;
  if (!Number.isSafeInteger(status.expectedProducts) || Number(status.expectedProducts) <= 0
    || status.capturedProducts !== status.expectedProducts || status.productCoverage !== 1) return false;
  if (!Number.isSafeInteger(status.expectedWarehouses) || Number(status.expectedWarehouses) <= 0
    || status.capturedWarehouses !== status.expectedWarehouses) return false;
  if (!Number.isSafeInteger(status.observedDays) || Number(status.observedDays) < 2
    || status.gapDays !== 0 || status.invalidSnapshots !== 0) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(status.firstBusinessDate ?? "")
    || !/^\d{4}-\d{2}-\d{2}$/.test(status.latestBusinessDate ?? "")) return false;
  const firstDay = Date.parse(`${status.firstBusinessDate}T00:00:00Z`);
  const latestDay = Date.parse(`${status.latestBusinessDate}T00:00:00Z`);
  if (!Number.isFinite(firstDay) || !Number.isFinite(latestDay)
    || new Date(firstDay).toISOString().slice(0, 10) !== status.firstBusinessDate
    || new Date(latestDay).toISOString().slice(0, 10) !== status.latestBusinessDate
    || latestDay - firstDay !== (Number(status.observedDays) - 1) * 86400000) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: status.businessTimezone });
    return true;
  } catch {
    return false;
  }
}

export async function readInventorySnapshotStatus(companyId: number): Promise<InventorySnapshotStatus> {
  const root = process.env.INVENTORY_SNAPSHOT_ROOT;
  if (!root || !Number.isSafeInteger(companyId) || companyId <= 0) return { status: "UNAVAILABLE" };
  try {
    const value = JSON.parse(await readFile(join(root, String(companyId), "status.json"), "utf8"));
    if (value.companyId !== companyId || value.database !== process.env.ODOO_DATABASE || value.version !== 1) return { status: "UNAVAILABLE" };
    if (!value.lastSuccessAt) return { status: "UNAVAILABLE", lastAttemptAt: value.lastAttemptAt, lastAttemptStatus: value.lastAttemptStatus };
    const age = Date.now() - Date.parse(value.lastSuccessAt);
    if (!Number.isFinite(age) || age < 0) return { status: "UNAVAILABLE" };
    const fields: Array<keyof InventorySnapshotStatus> = ["lastSuccessAt", "latestBusinessDate", "firstBusinessDate", "lastAttemptAt", "lastAttemptStatus", "businessTimezone", "expectedProducts", "capturedProducts", "productCoverage", "expectedWarehouses", "capturedWarehouses", "missingFields", "missingWarehouseQuantityFields", "observedDays", "gapDays", "invalidSnapshots", "supplierLeadTimeCoverage"];
    const metadata = Object.fromEntries(fields.map((field) => [field, value[field]]));
    const review = value.lastAttemptStatus === "FAILED" || value.productCoverage !== 1 || value.expectedWarehouses < 1 || value.capturedWarehouses !== value.expectedWarehouses
      || Object.values(value.missingFields ?? {}).some((count) => Number(count) > 0) || value.missingWarehouseQuantityFields > 0 || value.gapDays > 0 || value.invalidSnapshots > 0;
    return { ...metadata, status: age > 36 * 3600_000 ? "STALE" : review ? "REVIEW" : "FRESH" };
  } catch {
    return { status: "UNAVAILABLE" };
  }
}
