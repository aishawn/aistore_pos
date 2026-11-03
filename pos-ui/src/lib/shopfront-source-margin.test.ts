import test from "node:test";
import assert from "node:assert/strict";
import { shopfrontSourceMargin } from "./shopfront-source-margin.ts";

function sale(id = "sale", qty = 2, gross = 11, tax = 1, cost = 6) {
  const item = { id: `line-${id}`, item: { id: "water" }, quantity: qty, totalPrice: gross, tax, cost };
  return { id: 1, external_id: id, created_at: "2026-11-02 01:00:00", total_price: gross, total_tax: tax, total_cost: cost,
    raw_payload: { status: "COMPLETED", items: [{ source_product_id: "water", quantity: qty, line_total: gross, tax, cost, raw_payload: item }],
      raw_payload: { id, status: "COMPLETED", createdAt: "2026-11-02T01:00:00Z", totalPrice: gross, totalTax: tax, totalCost: cost, items: [item] } } };
}
const report = (rows: ReturnType<typeof sale>[], complete = true) => shopfrontSourceMargin(rows, "2026-11-01 00:00:00", "2026-11-03 00:00:00", complete);
test("source margin uses ex-tax sales and original LINE cost; quantity does not multiply cost", () => {
  const r = report([sale()]);
  assert.equal(r.netSales, 10); assert.equal(r.salesCost, 6); assert.equal(r.grossProfit, 4); assert.equal(r.grossMarginPercent, 40);
  assert.equal(r.accountingVerified, false); assert.equal(r.costEvidencePendingLines, 1);
});
test("source refunds reverse signed source cost and remain pending independent original-sale verification", () => {
  const r = report([sale(), sale("refund", -1, -5.5, -0.5, -3)]);
  assert.equal(r.netSales, 5); assert.equal(r.salesCost, 3); assert.equal(r.grossProfit, 2); assert.equal(r.grossMarginPercent, 40);
  assert.equal(r.refundLines, 1); assert.equal(r.accountingVerified, false);
});
test("missing raw cost cannot be normalized to verified zero, and mixed valid/invalid orders withhold whole-period margin", () => {
  const bad = sale("bad"); bad.raw_payload.raw_payload.items[0].cost = undefined as unknown as number;
  const r = report([sale(), bad]); assert.equal(r.complete, false); assert.equal(r.grossProfit, null); assert.equal(r.invalidOrders, 1);
});
test("duplicates, tax/order mismatch and incomplete coverage withhold source margin", () => {
  assert.equal(report([sale(), sale()]).grossMarginPercent, null);
  const bad = sale(); bad.total_tax = 0; assert.equal(report([bad]).grossMarginPercent, null);
  assert.equal(report([sale()], false).grossProfit, null);
});
test("cancelled/incomplete sales and upper boundary are excluded; zero or negative net has no ratio", () => {
  const incomplete = sale(); incomplete.raw_payload.status = "INCOMPLETE";
  const boundary = sale("boundary"); boundary.created_at = "2026-11-03 00:00:00";
  const r = report([sale("valid"), incomplete, boundary]); assert.equal(r.completedOrders, 1); assert.equal(r.excludedOrders, 1); assert.equal(r.grossMarginPercent, 40);
  assert.equal(report([]).grossMarginPercent, null); assert.equal(report([sale("refund", -2, -11, -1, -6)]).grossMarginPercent, null);
});

test("reproduces source order totals and discloses original line differences without distributing them", () => {
  const s = sale(); s.total_cost = 5.98; s.raw_payload.raw_payload.totalCost = 5.98;
  const r = report([s]); assert.equal(r.complete, true); assert.equal(r.salesCost, 5.98); assert.equal(r.grossProfit, 4.02);
  assert.equal(r.lineReconciliationComplete, false); assert.equal(r.ordersWithLineDifferences, 1); assert.equal(r.lineVsOrderCostDifference, 0.02);
  assert.equal(s.raw_payload.items[0].cost, 6); assert.equal(r.accountingVerified, false);
});

test("repeated product sale/refund uses distinct original lines and discloses a duplicated normalized last line", () => {
  const s = sale();
  const a = { ...s.raw_payload.raw_payload.items[0], id: "a", quantity: 24, totalPrice: 52, tax: 4.73, cost: 52.81 };
  const b = { ...a, id: "b", quantity: -24, totalPrice: -64.99, tax: -5.91, cost: -52.81 };
  s.raw_payload.raw_payload.items = [a, b];
  const normalized = { source_product_id: "water", quantity: b.quantity, line_total: b.totalPrice, tax: b.tax, cost: b.cost, raw_payload: b };
  s.raw_payload.items = [normalized, normalized];
  s.total_price = s.raw_payload.raw_payload.totalPrice = -12.99;
  s.total_tax = s.raw_payload.raw_payload.totalTax = -1.18;
  s.total_cost = s.raw_payload.raw_payload.totalCost = 0;
  const r = report([s]);
  assert.equal(r.complete, true); assert.equal(r.salesCost, 0); assert.equal(r.refundLines, 1);
  assert.deepEqual(r.normalizedMismatchSaleIds, ["sale"]); assert.equal(r.lineReconciliationComplete, true);
  s.raw_payload.raw_payload.items = [b, b];
  assert.equal(report([s]).complete, false);
});
