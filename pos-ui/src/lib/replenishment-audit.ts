/**
 * Client-side audit trail for replenishment approvals (draft RFQs).
 * Records what was suggested vs what was ordered so pilots can measure
 * adoption / quantity edits without auto-ordering.
 */

export type ReplenishmentAuditEntry = {
  id: string;
  createdAt: string;
  company: string;
  coverageDays: number;
  method: string;
  supplierId: number;
  supplierName: string;
  rfqName: string;
  rfqUrl: string;
  lines: Array<{
    productId: number;
    name: string;
    suggestedQuantity: number;
    orderedQuantity: number;
    reason: string;
  }>;
};

const STORAGE_KEY = "orithos-replenishment-audit-v1";
const MAX_ENTRIES = 40;

export function readReplenishmentAudit(): ReplenishmentAuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is ReplenishmentAuditEntry =>
      Boolean(entry)
      && typeof entry === "object"
      && typeof (entry as ReplenishmentAuditEntry).id === "string"
      && typeof (entry as ReplenishmentAuditEntry).createdAt === "string"
      && Array.isArray((entry as ReplenishmentAuditEntry).lines),
    );
  } catch {
    return [];
  }
}

export function appendReplenishmentAudit(entry: Omit<ReplenishmentAuditEntry, "id" | "createdAt"> & { id?: string; createdAt?: string }) {
  const next: ReplenishmentAuditEntry = {
    ...entry,
    id: entry.id ?? crypto.randomUUID(),
    createdAt: entry.createdAt ?? new Date().toISOString(),
  };
  const existing = readReplenishmentAudit();
  const merged = [next, ...existing].slice(0, MAX_ENTRIES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  return next;
}
