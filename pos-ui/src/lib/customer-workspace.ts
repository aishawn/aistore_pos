import type { OdooCustomerRecord } from "./odoo-api";

export type CustomerSource = {
  id: number; store_key: string; source_id: string; client_id: string | false;
  source_group: string | false; source_pricelist: string | false; pricing_status: string;
  balance_known?: boolean; source_balance?: number; source_updated_at: string | false;
  history_synced_at: string | false; synced_at: string; conflicts: string[];
};
export type CustomerTransaction = {
  id: number; reference: string; date: string; status: string; amount: number | null;
  operator: string | null;
  lines: { id: number; product: string; quantity: number | null; amount: number | null }[];
  payments: { id: number; reference: string; amount: number | null; status: string }[];
};
export type CustomerWorkspace = {
  customer?: OdooCustomerRecord; groups?: string[]; source?: CustomerSource | null;
  timezone?: string; currency?: string; canBalance?: boolean;
  items?: CustomerTransaction[]; hasNext?: boolean; total?: number; state?: "ready" | "unmapped" | "not_synced";
  activities?: { id: number; create_date: string; kind: string; summary: string; create_uid: [number, string] | false }[];
};

/** Missing/invalid provider values must never masquerade as zero. */
export function customerAmount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function customerReturnPath(value: string | null): string {
  return value && /^\/customers(?:\?[^#]*)?$/.test(value) ? value : "/customers";
}

export function customerHistoryDomain(source: Pick<CustomerSource, "store_key" | "source_id" | "client_id">): unknown[] {
  return [["store_key", "=", source.store_key], ["customer_source_id", "=", source.source_id]];
}
