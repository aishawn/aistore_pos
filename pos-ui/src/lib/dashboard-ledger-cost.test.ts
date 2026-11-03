import test from "node:test";
import assert from "node:assert/strict";
import { verifiedLedgerCosts } from "./dashboard-ledger-cost.ts";
import type { ReportRpc } from "./report-data.ts";

test("imported cost requires verification; native costs retain the ledger method", async () => {
  const rpc = (async (_session, model, _method, args) => {
    assert.ok(JSON.stringify(args).includes("company_id"));
    return model === "pos.order.line" ? [
      { id: 1, product_id: [10, "Imported"], total_cost: 48, is_total_cost_computed: true, shopfront_financials_verified: false },
      { id: 2, product_id: [10, "Imported"], total_cost: 2.48, is_total_cost_computed: true, shopfront_financials_verified: true },
      { id: 3, product_id: [11, "Native"], total_cost: 7, is_total_cost_computed: true },
    ] : [{ id: 10, shopfront_source_ref: "skr:water" }, { id: 11, shopfront_source_ref: false }];
  }) as ReportRpc;
  const result = await verifiedLedgerCosts(rpc, "fixture", 5, [1, 2, 3]);
  assert.equal(result.has(1), false); assert.equal(result.get(2), 2.48); assert.equal(result.get(3), 7);
});
