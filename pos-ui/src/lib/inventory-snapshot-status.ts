import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type InventorySnapshotStatus = {
  status: "UNAVAILABLE" | "FRESH" | "STALE" | "REVIEW";
  lastSuccessAt?: string;
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
};

export async function readInventorySnapshotStatus(companyId: number): Promise<InventorySnapshotStatus> {
  const root = process.env.INVENTORY_SNAPSHOT_ROOT;
  if (!root || !Number.isSafeInteger(companyId) || companyId <= 0) return { status: "UNAVAILABLE" };
  try {
    const value = JSON.parse(await readFile(join(root, String(companyId), "status.json"), "utf8"));
    if (value.companyId !== companyId || value.database !== process.env.ODOO_DATABASE || value.version !== 1) return { status: "UNAVAILABLE" };
    if (!value.lastSuccessAt) return { status: "UNAVAILABLE", lastAttemptAt: value.lastAttemptAt, lastAttemptStatus: value.lastAttemptStatus };
    const age = Date.now() - Date.parse(value.lastSuccessAt);
    if (!Number.isFinite(age) || age < 0) return { status: "UNAVAILABLE" };
    const fields: Array<keyof InventorySnapshotStatus> = ["lastSuccessAt", "lastAttemptAt", "lastAttemptStatus", "businessTimezone", "expectedProducts", "capturedProducts", "productCoverage", "expectedWarehouses", "capturedWarehouses", "missingFields", "missingWarehouseQuantityFields", "observedDays", "gapDays"];
    const metadata = Object.fromEntries(fields.map((field) => [field, value[field]]));
    const review = value.lastAttemptStatus === "FAILED" || value.productCoverage !== 1 || value.expectedWarehouses < 1 || value.capturedWarehouses !== value.expectedWarehouses
      || Object.values(value.missingFields ?? {}).some((count) => Number(count) > 0) || value.missingWarehouseQuantityFields > 0 || value.gapDays > 0 || value.invalidSnapshots > 0;
    return { ...metadata, status: age > 36 * 3600_000 ? "STALE" : review ? "REVIEW" : "FRESH" };
  } catch {
    return { status: "UNAVAILABLE" };
  }
}
