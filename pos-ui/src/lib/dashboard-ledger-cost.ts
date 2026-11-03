import type { ReportRpc } from "./report-data.ts";
import { divideCost, multiplyCost } from "./cost-reconciliation.ts";

type LedgerLine = { id: number; product_id: [number, string]; total_cost: number; is_total_cost_computed: boolean; shopfront_financials_verified: boolean;
  qty: number; refunded_orderline_id: [number, string] | false; refunded_qty: number };

/** Keep the original ledger valuation. A latest receipt price is only a comparison. */
export async function verifiedLedgerCosts(rpc: ReportRpc, session: string, companyId: number, lineIds: number[], correlationId?: string | null) {
  const result = new Map<number, number>();
  if (!lineIds.length) return result;
  const fields = ["product_id", "total_cost", "is_total_cost_computed", "shopfront_financials_verified", "qty", "refunded_orderline_id", "refunded_qty"];
  const lines = await rpc<LedgerLine[]>(session, "pos.order.line", "search_read", [[["id", "in", lineIds], ["order_id.company_id", "=", companyId]]], {
    fields, limit: lineIds.length,
  }, correlationId);
  if (!Array.isArray(lines) || lines.length !== lineIds.length) throw new Error("Incomplete ledger costing");
  const products = await rpc<Array<{ id: number; shopfront_source_ref: string | false }>>(session, "product.product", "search_read", [[["id", "in", [...new Set(lines.map(l => l.product_id[0]))]], ["company_id", "in", [false, companyId]]]], {
    fields: ["shopfront_source_ref"], limit: lineIds.length, active_test: false,
  }, correlationId);
  if (!Array.isArray(products)) throw new Error("Product costing evidence unavailable");
  const byId = new Map(products.map(p => [p.id, p]));
  const originalIds = [...new Set(lines.flatMap(line => line.qty < 0 && line.refunded_orderline_id ? [line.refunded_orderline_id[0]] : []))];
  const originals = originalIds.length ? await rpc<LedgerLine[]>(session, "pos.order.line", "search_read", [[["id", "in", originalIds], ["order_id.company_id", "=", companyId]]], { fields, limit: originalIds.length }, correlationId) : [];
  if (!Array.isArray(originals)) throw new Error("Original refund cost unavailable");
  const originalById = new Map(originals.map(line => [line.id, line]));
  for (const line of lines) {
    const product = byId.get(line.product_id[0]);
    if (!product || !line.is_total_cost_computed || !Number.isFinite(line.total_cost)) continue;
    if (product.shopfront_source_ref && line.shopfront_financials_verified !== true) continue;
    if (line.qty < 0) {
      const original = line.refunded_orderline_id && originalById.get(line.refunded_orderline_id[0]);
      if (!original || original.product_id[0] !== line.product_id[0] || !original.is_total_cost_computed
        || !Number.isFinite(original.total_cost) || original.total_cost < 0 || !Number.isFinite(original.qty) || original.qty <= 0
        || !Number.isFinite(original.refunded_qty) || original.refunded_qty > original.qty || -line.qty > original.qty
        || (product.shopfront_source_ref && original.shopfront_financials_verified !== true)) continue;
      const expected = multiplyCost(divideCost(original.total_cost, original.qty), line.qty);
      if (Math.abs(line.total_cost - expected) > 0.011) continue;
    } else if (!Number.isFinite(line.qty) || line.qty <= 0 || line.total_cost < 0) continue;
    result.set(line.id, line.total_cost);
  }
  return result;
}
