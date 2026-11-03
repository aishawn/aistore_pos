import { amount, auditTime, object, relationId, type AuditRecord, type AuditRpc, type AuditSnapshot } from "./cost-reconciliation.ts";
import { getOdooCompanyTimezone } from "./odoo-store-timezone.ts";
import { localMidnightUtc, salesDate, shiftDay } from "./replenishment-safety.ts";
import { createHash } from "node:crypto";

export function sourceOrderUuid(store: string, external: string): string {
  const namespace = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");
  const hash = createHash("sha1").update(namespace).update(`shopfront:${store}:${external}`).digest().subarray(0, 16);
  hash[6] = (hash[6] & 15) | 80; hash[8] = (hash[8] & 63) | 128;
  const s = hash.toString("hex"); return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/** Keyset pagination plus count/version checks: never silently accept a truncated/changing ledger. */
async function readAll(rpc: AuditRpc, model: string, domain: unknown[], fields: string[], max = 100_000): Promise<AuditRecord[]> {
  const count = await rpc<number>(model, "search_count", [domain], { active_test: false });
  if (!Number.isSafeInteger(count) || count < 0 || count > max) throw new Error("Audit exceeds its safe snapshot limit. Narrow the date range.");
  const rows: AuditRecord[] = []; let last = 0;
  while (rows.length < count) {
    const page = await rpc<AuditRecord[]>(model, "search_read", [[...domain, ["id", ">", last]]], { fields: [...new Set(["id", ...fields])], limit: 1000, order: "id asc", active_test: false });
    if (!Array.isArray(page) || !page.length) throw new Error("Incomplete audit source");
    for (const row of page) { if (!Number.isSafeInteger(row.id) || row.id <= last) throw new Error("Invalid audit pagination"); last = row.id; rows.push(row); }
  }
  if (rows.length !== count || await rpc<number>(model, "search_count", [domain], { active_test: false }) !== count) throw new Error("Source changed during audit. Generate again.");
  return rows;
}

export type AuditOptions = { companyId: number; store: string; fromDay?: string; toDay?: string; limit?: 20 | 0; now?: Date; timezone?: string };
export async function loadCostSnapshot(rpc: AuditRpc, options: AuditOptions): Promise<AuditSnapshot> {
  const { companyId, store } = options;
  if (!Number.isSafeInteger(companyId) || companyId <= 0 || !/^[a-z0-9-]+$/.test(store)) throw new Error("Invalid audit scope");
  const companies = await rpc<AuditRecord[]>("res.company", "read", [[companyId]], { fields: ["country_id", "state_id"] });
  const company = companies[0]; if (!company || company.id !== companyId) throw new Error("Company unavailable");
  const timezone = options.timezone || getOdooCompanyTimezone(company.country_id as [number, string], company.state_id as [number, string]);
  const now = options.now ?? new Date(), today = salesDate(now.toISOString(), timezone);
  // Last 30 completed business days. The upper business date is exclusive.
  const fromDay = options.fromDay ?? shiftDay(today, -30), toDay = options.toDay ?? today;
  for (const day of [fromDay, toDay]) if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) !== day) throw new Error("Invalid business date");
  const days = (Date.parse(toDay) - Date.parse(fromDay)) / 86400000;
  if (days <= 0 || days > 366 || toDay > today) throw new Error("Choose between 1 and 366 completed business days");
  const from = localMidnightUtc(fromDay, timezone), to = localMidnightUtc(toDay, timezone);
  const capturedAt = now.toISOString(), cutoff = capturedAt.slice(0, 19).replace("T", " ");
  const orderDomain: unknown[] = [["company_id", "=", companyId], ["state", "in", ["paid", "done", "invoiced"]], ["date_order", ">=", from], ["date_order", "<", to]];
  const lineDomain: unknown[] = [["order_id.company_id", "=", companyId], ["order_id.state", "in", ["paid", "done", "invoiced"]], ["order_id.date_order", ">=", from], ["order_id.date_order", "<", to]];
  const [orders, lines, receipts, sourceSales] = await Promise.all([
    readAll(rpc, "pos.order", orderDomain, ["company_id", "uuid", "date_order", "amount_tax", "amount_total", "state", "write_date"]),
    readAll(rpc, "pos.order.line", lineDomain, ["product_id", "order_id", "qty", "price_subtotal", "price_subtotal_incl", "total_cost", "is_total_cost_computed", "write_date"]),
    readAll(rpc, "shopfront.sync.purchase.order", [["company_id", "=", companyId], ["store_key", "=", store], ["source_status", "=", "RECEIVED"]], ["company_id", "store_key", "source_id", "source_status", "order_date", "raw_payload", "write_date"], 20_000),
    readAll(rpc, "shopfront.sync.sale", [["store_key", "=", store], ["created_at", ">=", shiftDay(fromDay, -1)], ["created_at", "<", shiftDay(toDay, 1)]], ["external_id", "created_at", "total_price", "total_tax", "total_cost", "raw_payload", "write_date"]),
  ]);
  const totals = new Map<number, { net: number; gross: number }>();
  const rank = new Map<number, number>();
  for (const line of lines) {
    const orderId = relationId(line.order_id), productId = relationId(line.product_id), quantity = amount(line.qty);
    if (quantity === null || amount(line.price_subtotal) === null || amount(line.price_subtotal_incl) === null) throw new Error("Invalid sale amounts");
    const total = totals.get(orderId) ?? { net: 0, gross: 0 };
    total.net += Number(line.price_subtotal); total.gross += Number(line.price_subtotal_incl); totals.set(orderId, total);
    if (quantity > 0 && productId) rank.set(productId, (rank.get(productId) ?? 0) + quantity);
  }
  for (const order of orders) {
    if (relationId(order.company_id) !== companyId || !Number.isFinite(auditTime(order.date_order))) throw new Error("Order outside audit scope");
    const total = totals.get(order.id), tax = amount(order.amount_tax), gross = amount(order.amount_total);
    order.audit_tax_mismatch = !total || tax === null || gross === null || Math.abs(total.gross - total.net - tax) > 0.011 || Math.abs(total.gross - gross) > 0.011;
  }
  const ids = [...rank].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, options.limit === 0 ? rank.size : 20).map(([id]) => id);
  const products: AuditRecord[] = [];
  for (let i = 0; i < ids.length; i += 200) products.push(...await rpc<AuditRecord[]>("product.product", "search_read", [[["id", "in", ids.slice(i, i + 200)], ["company_id", "in", [false, companyId]]]], {
    fields: ["name", "shopfront_source_ref", "standard_price", "cost_method", "uom_id", "write_date"], limit: 200, active_test: false,
  }));
  if (products.length !== ids.length) throw new Error("Incomplete product scope");
  // A non-transactional RPC snapshot must fail closed if any evidence was edited while collecting it.
  if ([...orders, ...lines, ...receipts, ...products, ...sourceSales].some(row => typeof row.write_date === "string" && row.write_date >= cutoff)) throw new Error("Source updated during collection. Generate again.");
  for (const [model, domain] of [["pos.order", orderDomain], ["pos.order.line", lineDomain], ["shopfront.sync.purchase.order", [["company_id", "=", companyId], ["store_key", "=", store], ["source_status", "=", "RECEIVED"]]], ["product.product", [["id", "in", ids]]], ["shopfront.sync.sale", [["store_key", "=", store], ["created_at", ">=", shiftDay(fromDay, -1)], ["created_at", "<", shiftDay(toDay, 1)]]]] as [string, unknown[]][]) {
    const changed = await rpc<number>(model, "search_count", [[...domain, ["write_date", ">=", cutoff]]], { active_test: false });
    if (changed) throw new Error("Source changed during collection. Generate again.");
  }
  const selected = new Set(ids), selectedOrders = new Set(lines.filter(l => selected.has(relationId(l.product_id))).map(l => relationId(l.order_id)));
  const sourceByUuid = new Map(sourceSales.map(row => [sourceOrderUuid(store, String(row.external_id)), row]));
  const productById = new Map(products.map(p => [p.id, p]));
  const linesByOrder = new Map<number, AuditRecord[]>();
  for (const line of lines) { const key = relationId(line.order_id), rows = linesByOrder.get(key) ?? []; rows.push(line); linesByOrder.set(key, rows); }
  for (const order of orders.filter(o => selectedOrders.has(o.id))) {
    const source = sourceByUuid.get(String(order.uuid)); if (!source) continue;
    const payload = object(source.raw_payload), items = Array.isArray(payload.items) ? payload.items.map(object) : [];
    if (!items.length || auditTime(order.date_order) !== auditTime(source.created_at)) continue;
    const values = items.map(item => ({ gross: amount(item.line_total), tax: amount(item.tax), cost: amount(item.cost) }));
    if (values.some(v => v.gross === null || v.tax === null || v.cost === null)) continue;
    const agrees = (key: "gross" | "tax" | "cost", total: unknown) => amount(total) !== null && Math.abs(values.reduce((sum, v) => sum + Number(v[key]), 0) - Number(total)) <= 0.011;
    if (!agrees("gross", source.total_price) || !agrees("tax", source.total_tax) || !agrees("cost", source.total_cost) || Math.abs(Number(source.total_price) - Number(order.amount_total)) > 0.011) continue;
    const orderLines = linesByOrder.get(order.id) ?? [];
    for (const line of orderLines.filter(l => selected.has(relationId(l.product_id)))) {
      const product = productById.get(relationId(line.product_id)), ref = String(product?.shopfront_source_ref || "");
      const matches = items.filter(item => `${store}:${item.source_product_id}` === ref && amount(item.quantity) === amount(line.qty) && amount(item.line_total) === amount(line.price_subtotal_incl));
      const nativeMatches = orderLines.filter(l => relationId(l.product_id) === relationId(line.product_id) && amount(l.qty) === amount(line.qty) && amount(l.price_subtotal_incl) === amount(line.price_subtotal_incl));
      if (matches.length !== 1 || nativeMatches.length !== 1 || !object(matches[0].raw_payload).id) continue;
      line.source_evidence = { verified: true, saleId: source.external_id, lineId: object(matches[0].raw_payload).id, lineCost: matches[0].cost, tax: matches[0].tax };
    }
  }
  const selectedUuids = new Set(orders.filter(o => selectedOrders.has(o.id)).map(o => String(o.uuid)));
  return { companyId, store, timezone, from, to, capturedAt, products, lines: lines.filter(l => selected.has(relationId(l.product_id))),
    orders: orders.filter(o => selectedOrders.has(o.id)), receipts: receipts.map(row => ({ ...row, raw_payload: object(row.raw_payload) })), sourceSales: sourceSales.filter(s => selectedUuids.has(sourceOrderUuid(store, String(s.external_id)))) };
}
