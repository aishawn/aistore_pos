import test from "node:test";
import assert from "node:assert/strict";
import { verifiedLedgerCosts } from "./dashboard-ledger-cost.ts";
import type { ReportRpc } from "./report-data.ts";

test("imported cost requires verification; native costs retain the ledger method", async () => {
  const rpc = (async (_session, model, _method, args) => {
    assert.ok(JSON.stringify(args).includes("company_id"));
    return model === "pos.order.line" ? [
      { id: 1, product_id: [10, "Imported"], qty: 1, total_cost: 48, is_total_cost_computed: true, shopfront_financials_verified: false },
      { id: 2, product_id: [10, "Imported"], qty: 1, total_cost: 2.48, is_total_cost_computed: true, shopfront_financials_verified: true },
      { id: 3, product_id: [11, "Native"], qty: 1, total_cost: 7, is_total_cost_computed: true },
    ] : [{ id: 10, shopfront_source_ref: "skr:water" }, { id: 11, shopfront_source_ref: false }];
  }) as ReportRpc;
  const result = await verifiedLedgerCosts(rpc, "fixture", 5, [1, 2, 3]);
  assert.equal(result.has(1), false); assert.equal(result.get(2), 2.48); assert.equal(result.get(3), 7);
});

test("refund cost must reverse the same product's verified original cost proportionally", async () => {
  const original = { id: 10, product_id: [20, "Imported"], qty: 4, refunded_qty: 2, total_cost: 12, is_total_cost_computed: true, shopfront_financials_verified: true };
  let refund = { id: 11, product_id: [20, "Imported"], qty: -2, total_cost: -6, is_total_cost_computed: true, shopfront_financials_verified: true, refunded_orderline_id: [10, "Original"] as [number, string] | false };
  const rpc = (async (_session, model, _method, args) => model === "product.product" ? [{ id: 20, shopfront_source_ref: "skr:water" }]
    : JSON.stringify(args).includes('"id","in",[10]') ? [original] : [refund]) as ReportRpc;
  assert.equal((await verifiedLedgerCosts(rpc, "fixture", 5, [11])).get(11), -6);
  refund = { ...refund, total_cost: -7 }; assert.equal((await verifiedLedgerCosts(rpc, "fixture", 5, [11])).size, 0);
  refund = { ...refund, total_cost: -6, refunded_orderline_id: false }; assert.equal((await verifiedLedgerCosts(rpc, "fixture", 5, [11])).size, 0);
  refund = { ...refund, refunded_orderline_id: [10, "Original"] }; original.refunded_qty = 5;
  assert.equal((await verifiedLedgerCosts(rpc, "fixture", 5, [11])).size, 0);
});
