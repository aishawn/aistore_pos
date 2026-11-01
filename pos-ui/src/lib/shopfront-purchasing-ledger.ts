import { normalizePurchasingRow, type PurchasingKind, type ShopfrontPurchasingRecord } from "./shopfront-purchasing.ts";

type Rpc = <T>(model: string, method: string, args: unknown[], kwargs?: Record<string, unknown>) => Promise<T>;
type SourceRow = Parameters<typeof normalizePurchasingRow>[0];
type LedgerRow = {
  id: number; source_id: string; source_status: string; source_total: number | null;
  order_date: string; raw_payload: SourceRow["raw_payload"] & { totalCost?: number };
  synced_at: string; name: string; shopfront_supplier_ref: string;
  shopfront_supplier_status: string;
  shopfront_supplier_payload: SourceRow["raw_payload"] & { businessNumber?: string };
};

/** Read the preserved source ledger, including archived suppliers and orders
 * which could not be materialized as native purchase orders. Never write stock. */
export async function loadPurchasingLedger(rpc: Rpc, companyId: number, store: string, kind: PurchasingKind) {
  if (!Number.isSafeInteger(companyId) || companyId <= 0 || store !== "skr") throw new Error("Invalid purchasing scope");
  const suppliers = kind === "suppliers";
  const model = suppliers ? "res.partner" : "shopfront.sync.purchase.order";
  const domain = [["company_id", "=", companyId], suppliers
    ? ["shopfront_supplier_ref", "=like", `${store}:%`]
    : ["store_key", "=", store]];
  const fields = suppliers
    ? ["name", "shopfront_supplier_ref", "shopfront_supplier_status", "shopfront_supplier_payload"]
    : ["source_id", "source_status", "source_total", "order_date", "raw_payload", "synced_at"];
  const expected = await rpc<number>(model, "search_count", [domain], { active_test: false });
  if (!Number.isSafeInteger(expected) || expected < 0 || expected > 50_000) throw new Error("Invalid purchasing ledger count");
  const rows: ShopfrontPurchasingRecord[] = [];
  let lastId = 0;
  while (rows.length < expected) {
    const page = await rpc<LedgerRow[]>(model, "search_read", [[...domain, ["id", ">", lastId]]], {
      fields, order: "id asc", limit: 500, active_test: false,
    });
    if (!page.length) throw new Error("Incomplete purchasing ledger");
    for (const row of page) {
      if (row.id <= lastId) throw new Error("Invalid purchasing ledger pagination");
      lastId = row.id;
      const raw = suppliers ? row.shopfront_supplier_payload || {} : row.raw_payload || {};
      const amount = "totalCost" in raw && raw.totalCost != null ? raw.totalCost : row.source_total;
      rows.push(normalizePurchasingRow(suppliers ? {
        source_id: row.shopfront_supplier_ref.slice(store.length + 1), name: row.name,
        status: row.shopfront_supplier_status, business_number: "businessNumber" in raw ? raw.businessNumber : "",
        raw_payload: raw,
      } : {
        source_id: row.source_id, status: row.source_status, order_date: row.order_date,
        // Match the source mirror's Numeric(18, 4) precision, retaining zero.
        total_cost: amount == null ? null : Number(amount).toFixed(4),
        raw_payload: raw, synced_at: row.synced_at,
      }, kind));
    }
  }
  if (rows.length !== expected || rows.some((row) => !row.id) || new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error("Incomplete purchasing ledger");
  return rows;
}

/** A rebuilding crawler must not erase durable history. Fresh crawler records
 * update matching source IDs and add new IDs without duplicating old orders. */
export function mergePurchasingSources(ledger: ShopfrontPurchasingRecord[], crawler: ShopfrontPurchasingRecord[], kind: PurchasingKind) {
  const rows = [...new Map([...ledger, ...crawler].map((row) => [row.id, row])).values()];
  return rows.sort((a, b) => kind === "suppliers" ? a.name.localeCompare(b.name) : b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}
