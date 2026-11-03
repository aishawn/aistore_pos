import type { ReportRpc } from "./report-data.ts";

type Relation = [number, string] | false;
export type CostSale = { id: number; product_id: Relation; product_uom_id: Relation; qty: number; price_subtotal: number; "order_id.date_order": string };
type Receipt = { id: number; product_id: Relation; purchase_line_id: Relation; date: string; quantity: number };
type Purchase = { id: number; product_id: Relation; product_uom_id: Relation; product_qty: number; price_subtotal: number; currency_id: Relation };
type Unit = { id: number; factor: number; relative_uom_id: Relation };

const id = (value: Relation) => value ? value[0] : 0;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Last completed supplier receipt at the sale time. Never substitute today's product cost. */
export async function purchaseCosts(rpc: ReportRpc, session: string, companyId: number, currency: string, lines: CostSale[], correlationId?: string | null) {
  const result = new Map<number, number>();
  if (!lines.length) return result;
  const productIds = [...new Set(lines.map(line => id(line.product_id)))].filter(Boolean);
  const latest = lines.map(line => line["order_id.date_order"]).sort().at(-1)!;
  const moves = await rpc<Receipt[]>(session, "stock.move", "search_read", [[
    ["company_id", "=", companyId], ["state", "=", "done"], ["purchase_line_id", "!=", false],
    ["location_id.usage", "=", "supplier"], ["location_dest_id.usage", "=", "internal"],
    ["quantity", ">", 0], ["product_id", "in", productIds], ["date", "<=", latest],
  ]], { fields: ["product_id", "purchase_line_id", "date", "quantity"], order: "date desc, id desc", limit: 10001 }, correlationId);
  if (!Array.isArray(moves) || moves.length > 10000) throw new Error("Purchase receipt history is incomplete");
  if (!moves.length) return result;
  const purchases = await rpc<Purchase[]>(session, "purchase.order.line", "search_read", [[
    ["id", "in", [...new Set(moves.map(move => id(move.purchase_line_id)))]], ["company_id", "=", companyId],
    ["state", "in", ["purchase", "done"]],
  ]], { fields: ["product_id", "product_uom_id", "product_qty", "price_subtotal", "currency_id"], limit: 10001 }, correlationId);
  if (!Array.isArray(purchases)) throw new Error("Purchase prices are unavailable");
  const byId = new Map(purchases.map(row => [row.id, row]));
  const unitIds = [...new Set([...purchases.map(row => id(row.product_uom_id)), ...lines.map(row => id(row.product_uom_id))])].filter(Boolean);
  const units = await rpc<Unit[]>(session, "uom.uom", "read", [unitIds], { fields: ["factor", "relative_uom_id"] }, correlationId);
  if (!Array.isArray(units)) throw new Error("Purchase units are unavailable");
  const unitById = new Map(units.map(row => [row.id, row]));
  for (let depth = 0; depth < 16; depth++) {
    const missing = [...new Set([...unitById.values()].map(unit => id(unit.relative_uom_id)).filter(value => value && !unitById.has(value)))];
    if (!missing.length) break;
    const parents = await rpc<Unit[]>(session, "uom.uom", "read", [missing], { fields: ["factor", "relative_uom_id"] }, correlationId);
    if (!parents?.length) throw new Error("Unit ancestry is incomplete");
    for (const parent of parents) unitById.set(parent.id, parent);
  }
  const root = (unitId: number) => {
    const seen = new Set<number>();
    while (unitId && !seen.has(unitId)) {
      seen.add(unitId);
      const unit = unitById.get(unitId);
      if (!unit) return 0;
      if (!unit.relative_uom_id) return unitId;
      unitId = id(unit.relative_uom_id);
    }
    return 0;
  };
  for (const sale of lines) {
    // Do not skip a bad latest receipt and silently reuse an older cheaper price.
    // Refunds need the original sale's purchase basis, not the receipt price at refund time.
    if (sale.qty < 0) continue;
    const receipt = moves.find(move => id(move.product_id) === id(sale.product_id) && move.date <= sale["order_id.date_order"]);
    const purchase = receipt && byId.get(id(receipt.purchase_line_id));
    if (!purchase || id(purchase.product_id) !== id(sale.product_id) || !purchase.currency_id || purchase.currency_id[1] !== currency
      || !finite(purchase.product_qty) || purchase.product_qty <= 0 || !finite(purchase.price_subtotal) || purchase.price_subtotal < 0 || !finite(sale.qty)) continue;
    let ratio = 1;
    if (id(purchase.product_uom_id) !== id(sale.product_uom_id)) {
      const purchaseUnit = unitById.get(id(purchase.product_uom_id));
      const saleUnit = unitById.get(id(sale.product_uom_id));
      const purchaseRoot = root(id(purchase.product_uom_id));
      if (!purchaseUnit || !saleUnit || !purchaseRoot || purchaseRoot !== root(id(sale.product_uom_id))
        || !finite(purchaseUnit.factor) || !finite(saleUnit.factor) || purchaseUnit.factor <= 0 || saleUnit.factor <= 0) continue;
      ratio = saleUnit.factor / purchaseUnit.factor;
    }
    if (!id(sale.product_uom_id)) continue;
    const cost = purchase.price_subtotal / purchase.product_qty * ratio * sale.qty;
    if (finite(cost)) result.set(sale.id, cost);
  }
  return result;
}
