import test from "node:test";
import assert from "node:assert/strict";
import { sourceTaxRepairPlan } from "./source-tax-repair.ts";
import { sourceOrderUuid } from "./cost-reconciliation-source.ts";
import type { AuditSnapshot } from "./cost-reconciliation.ts";
import { reconcileCosts } from "./cost-reconciliation.ts";

function fixture(): AuditSnapshot {
  const original = { id: "a", item: { id: "water" }, quantity: 2, totalPrice: 11, tax: 1 };
  return { companyId: 5, store: "skr", timezone: "Australia/Adelaide", from: "2026-11-01 00:00:00", to: "2026-11-03 00:00:00", capturedAt: "2026-11-03T01:00:00Z",
    products: [{ id: 1, shopfront_source_ref: "skr:water" }], receipts: [],
    orders: [{ id: 10, uuid: sourceOrderUuid("skr", "sale"), company_id: [5, "SKR"], state: "paid", date_order: "2026-11-02 00:00:00", amount_total: 11, amount_tax: 0, write_date: "2026-11-02 01:00:00" }],
    lines: [{ id: 20, order_id: [10, "sale"], product_id: [1, "water"], qty: 2, price_subtotal: 11, price_subtotal_incl: 11, total_cost: 99, is_total_cost_computed: true, write_date: "2026-11-02 01:00:00" }],
    sourceSales: [{ id: 30, external_id: "sale", created_at: "2026-11-02 00:00:00", total_price: 11, total_tax: 1, raw_payload: { raw_payload: { id: "sale", status: "COMPLETED", createdAt: "2026-11-02T00:00:00Z", totalPrice: 11, totalTax: 1, items: [original] } } }],
    coverage: { allProducts: true, sourceRowsComplete: true, totalOrders: 1, totalLines: 1, selectedLines: 1 } };
}
test("tax correction is independent of missing purchase costs and never changes costs or certifies them", () => {
  const s = fixture(), before = JSON.stringify(s), r = sourceTaxRepairPlan(s, "hash");
  assert.equal(r.summary.needsChange, 1); assert.equal(r.orders[0].lines[0].proposed.price_subtotal, 10);
  assert.equal(r.orders[0].proposed?.amount_tax, 1); assert.equal(r.orders[0].lines[0].expected.totalCost, 99);
  assert.equal(r.changesCosts, false); assert.equal(r.accountingCostsVerified, false); assert.equal(r.executable, false);
  assert.equal(JSON.stringify(s), before);
  s.lines[0].price_subtotal = 10; s.orders[0].amount_tax = 1;
  assert.equal(sourceTaxRepairPlan(s, "new-hash").summary.needsChange, 0);
});
test("source one-cent line/order difference is blocked without a manufactured rounding adjustment", () => {
  const s = fixture(); s.sourceSales![0].total_tax = 1.01;
  const raw = (s.sourceSales![0].raw_payload as { raw_payload: Record<string, unknown> }).raw_payload; raw.totalTax = 1.01;
  const r = sourceTaxRepairPlan(s, "hash"); assert.equal(r.summary.supported, 0);
  assert.ok(r.orders[0].blockers.includes("SOURCE_LINE_ORDER_DIFFERENCE")); assert.deepEqual(r.orders[0].lines, []);
});
test("same product with indistinguishable lines requires stable line identities and a bijection", () => {
  const s = fixture(), raw = (s.sourceSales![0].raw_payload as { raw_payload: { items: Record<string, unknown>[]; totalPrice: number; totalTax: number } }).raw_payload;
  raw.items.push({ ...raw.items[0], id: "b" }); raw.totalPrice = 22; raw.totalTax = 2;
  s.sourceSales![0].total_price = 22; s.sourceSales![0].total_tax = 2; s.orders[0].amount_total = 22;
  s.lines.push({ ...s.lines[0], id: 21 }); s.coverage!.totalLines = 2;
  assert.equal(sourceTaxRepairPlan(s, "hash").summary.supported, 0);
  s.lines[0].shopfront_source_line_ref = "skr:a"; s.lines[1].shopfront_source_line_ref = "skr:b";
  assert.equal(sourceTaxRepairPlan(s, "hash").summary.supportedLines, 2);
  s.lines[1].shopfront_source_line_ref = "skr:a";
  assert.equal(sourceTaxRepairPlan(s, "hash").summary.supported, 0);
});
test("uncompleted source, missing preconditions, wrong company and partial coverage cannot authorize repair", () => {
  const s = fixture(); s.orders[0].company_id = [137, "Other"];
  assert.ok(sourceTaxRepairPlan(s, "hash").orders[0].blockers.includes("TARGET_ORDER_SCOPE_INVALID"));
  s.orders[0].company_id = [5, "SKR"]; delete s.lines[0].write_date;
  assert.equal(sourceTaxRepairPlan(s, "hash").summary.supported, 0);
  const p = fixture(); p.coverage!.allProducts = false;
  assert.ok(sourceTaxRepairPlan(p, "hash").executionBlockers.includes("FULL_SCOPE_REQUIRED"));
  (p.sourceSales![0].raw_payload as {raw_payload: {status: string}}).raw_payload.status = "INCOMPLETE";
  assert.equal(sourceTaxRepairPlan(p, "hash").summary.supported, 0);
});

test("tax-only captures cannot turn deliberately uncollected receipts into missing cost evidence", () => {
  const s = fixture(); s.purpose = "source_tax_only";
  assert.equal(sourceTaxRepairPlan(s, "hash").summary.supported, 1);
  assert.throws(() => reconcileCosts(s, "batch", "hash"), /do not collect purchase cost evidence/);
});
