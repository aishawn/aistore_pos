import test from "node:test";
import assert from "node:assert/strict";
import { reconcileCosts, costAuditCsv, amount, divideCost, multiplyCost, type AuditSnapshot } from "./cost-reconciliation.ts";
import { sourceOrderUuid, loadCostSnapshot } from "./cost-reconciliation-source.ts";
import { localMidnightUtc } from "./replenishment-safety.ts";

function fixture(): AuditSnapshot {
  return { companyId: 5, store: "skr", timezone: "Australia/Adelaide", from: "2026-10-01 00:00:00", to: "2026-11-01 00:00:00", capturedAt: "2026-11-03T00:00:00Z",
    products: [{ id: 1, name: "Water", standard_price: 49.68, shopfront_source_ref: "skr:water", cost_method: "standard", uom_id: [1, "Units"] }],
    lines: [{ id: 10, product_id: [1, "Water"], order_id: [20, "Sale"], qty: 2, total_cost: 99.36, price_subtotal: 9, price_subtotal_incl: 9, is_total_cost_computed: true }],
    orders: [{ id: 20, date_order: "2026-10-31 12:00:00", amount_tax: 0 }],
    receipts: [{ id: 30, source_id: "receipt", source_status: "RECEIVED", raw_payload: { receivedAt: "2026-10-30T02:00:00+0000", products: [{ item: { id: "water" }, receivedQuantity: 20, caseQuantity: 20, orderedCost: 49.68, supplier: { name: "Supplier" } }] } }] };
}
const audit = (s: AuditSnapshot) => reconcileCosts(s, "batch", "hash");
test("case division is evidence; missing tax and historical cost block correction", () => {
  const row = audit(fixture()).products[0].lines[0];
  assert.equal(row.candidateUnitCost, 2.484); assert.equal(row.currentUnitCost, 49.68);
  assert.equal(row.verifiedReceiptUnitCost, null); assert.equal(row.status, "review");
  assert.ok(row.issues.includes("PURCHASE_TAX_UNVERIFIED")); assert.equal(row.proposedTotalCost, null);
});
test("receipt selection uses receivedAt before the sale, never orderDate or a future receipt", () => {
  const s = fixture(); s.receipts.push({ ...s.receipts[0], id: 31, source_id: "future", order_date: "2020-01-01", raw_payload: { receivedAt: "2026-11-01T00:00:00Z", products: [{ item: { id: "water" }, receivedQuantity: 20, caseQuantity: 20, orderedCost: 80 }] } });
  assert.equal(audit(s).products[0].lines[0].receiptId, "receipt");
  s.receipts[0].raw_payload = { receivedAt: "2026-10-31T12:00:00Z", products: [{ item: { id: "water" }, receivedQuantity: 20 }] };
  assert.ok(audit(s).products[0].issues.includes("RECEIPT_SALE_ORDER_UNKNOWN"));
});
test("missing case quantity, unknown receipt time and zero source cost remain distinct", () => {
  const s = fixture(); s.receipts[0].raw_payload = { receivedAt: "2026-10-30", products: [{ item: { id: "water" }, receivedQuantity: 1, orderedCost: 0 }] };
  assert.ok(audit(s).products[0].issues.includes("RECEIPT_TIME_UNKNOWN"));
  assert.equal(amount(null), null); assert.equal(amount(false), null); assert.equal(amount(""), null); assert.equal(amount(0), 0);
});
test("source sales cost is a line total, never multiplied by quantity", () => {
  const s = fixture(); s.lines[0].qty = 6;
  s.lines[0].source_evidence = { verified: true, saleId: "sale-1", lineId: "line-1", lineCost: 11.27, tax: 1.73 };
  const row = audit(s).products[0].lines[0]; assert.equal(row.proposedTotalCost, 11.27); assert.equal(row.proposedNet, 7.27);
  assert.equal(row.status, "review"); assert.equal(row.sourceLineId, "line-1");
});
test("invoice-backed receipt price cannot replace a verified historical standard cost", () => {
  const s = fixture(), raw = s.receipts[0].raw_payload as { products: Record<string, unknown>[] };
  raw.products[0].costEvidence = { verified: true, documentRef: "invoice-1", unit: "case", netPerCase: 40, taxPerCase: 4, taxRecoverable: true };
  s.lines[0].cost_evidence = { verified: true, documentRef: "cost-history-1", unitCost: 3 };
  const row = audit(s).products[0].lines[0]; assert.equal(row.verifiedReceiptUnitCost, 2); assert.equal(row.proposedTotalCost, 6); assert.equal(row.status, "correctable");
  s.products[0].cost_method = "fifo"; assert.equal(audit(s).products[0].status, "review");
});
test("refunds stay linked to original cost; sales tax mismatch blocks otherwise supported repair", () => {
  const s = fixture(); s.lines[0].qty = -2; assert.equal(audit(s).products[0].returned, 2); assert.equal(audit(s).products[0].sold, 0);
  assert.ok(audit(s).products[0].issues.includes("REFUND_ORIGINAL_COST_REQUIRED"));
  s.orders[0].audit_tax_mismatch = true; assert.equal(audit(s).summary.grossProfit, null);
});
test("decimal boundaries and CSV prevent rounding drift and spreadsheet formula execution", () => {
  assert.equal(divideCost(49.68, 20), 2.484); assert.equal(multiplyCost(2.484, 6), 14.904);
  const s = fixture(); s.products[0].name = '=HYPERLINK("external")';
  const csv = costAuditCsv(audit(s)); assert.ok(csv.includes("'=HYPERLINK")); assert.ok(csv.includes("sourceHash"));
  assert.equal(audit(s).products[0].lines.length, 1);
});
test("source identity exactly matches Python UUIDv5 import namespace", () => {
  assert.equal(sourceOrderUuid("skr", "11f1d6a3a62b29a68ec30affe09cd901"), "494aea86-ffe8-5c76-aab2-ec5ae1656154");
});
test("store midnight respects DST, independently of browser timezone", () => {
  assert.equal(localMidnightUtc("2026-10-04", "Australia/Adelaide"), "2026-10-03 14:30:00");
  assert.equal(localMidnightUtc("2026-10-05", "Australia/Adelaide"), "2026-10-04 13:30:00");
});
test("invalid dates and incomplete source snapshots fail closed", async () => {
  const rpc = (async (_model: string, method: string) => method === "read" ? [{ id: 5, country_id: [13, "Australia"], state_id: false }] : method === "search_count" ? 2 : []) as Parameters<typeof loadCostSnapshot>[0];
  await assert.rejects(loadCostSnapshot(rpc, { companyId: 5, store: "skr", fromDay: "2026-02-30", now: new Date("2026-11-03T00:00:00Z") }));
  await assert.rejects(loadCostSnapshot(rpc, { companyId: 5, store: "skr", now: new Date("2026-11-03T00:00:00Z") }), /Incomplete/);
});
