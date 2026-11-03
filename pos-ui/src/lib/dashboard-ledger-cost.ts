import type { ReportRpc } from "./report-data.ts";

/** Keep the original ledger valuation. A latest receipt price is only a comparison. */
export async function verifiedLedgerCosts(rpc: ReportRpc, session: string, companyId: number, lineIds: number[], correlationId?: string | null) {
  const result = new Map<number, number>();
  if (!lineIds.length) return result;
  const lines = await rpc<Array<{ id: number; product_id: [number, string]; total_cost: number; is_total_cost_computed: boolean; shopfront_financials_verified: boolean }>>(session, "pos.order.line", "search_read", [[["id", "in", lineIds], ["order_id.company_id", "=", companyId]]], {
    fields: ["product_id", "total_cost", "is_total_cost_computed", "shopfront_financials_verified"], limit: lineIds.length,
  }, correlationId);
  if (!Array.isArray(lines) || lines.length !== lineIds.length) throw new Error("Incomplete ledger costing");
  const products = await rpc<Array<{ id: number; shopfront_source_ref: string | false }>>(session, "product.product", "search_read", [[["id", "in", [...new Set(lines.map(l => l.product_id[0]))]], ["company_id", "in", [false, companyId]]]], {
    fields: ["shopfront_source_ref"], limit: lineIds.length, active_test: false,
  }, correlationId);
  if (!Array.isArray(products)) throw new Error("Product costing evidence unavailable");
  const byId = new Map(products.map(p => [p.id, p]));
  for (const line of lines) {
    const product = byId.get(line.product_id[0]);
    if (!product || !line.is_total_cost_computed || !Number.isFinite(line.total_cost)) continue;
    if (product.shopfront_source_ref && line.shopfront_financials_verified !== true) continue;
    result.set(line.id, line.total_cost);
  }
  return result;
}
