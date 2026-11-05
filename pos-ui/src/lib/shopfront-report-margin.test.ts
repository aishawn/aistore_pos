import test from "node:test";
import assert from "node:assert/strict";
import { readShopfrontReportMargin } from "./shopfront-report-margin.ts";
import type { ReportRpc } from "./report-data.ts";

const line = { id: "line-1", item: { id: "product-1" }, quantity: 1, totalPrice: 11, tax: 1, cost: 6 };
const sourceSale = {
  id: 1,
  external_id: "sale-1",
  created_at: "2026-11-02 01:00:00",
  total_price: 11,
  total_tax: 1,
  total_cost: 6,
  raw_payload: {
    status: "COMPLETED",
    items: [{ source_product_id: "product-1", quantity: 1, line_total: 11, tax: 1, cost: 6, raw_payload: line }],
    raw_payload: { id: "sale-1", status: "COMPLETED", createdAt: "2026-11-02T01:00:00Z", totalPrice: 11, totalTax: 1, totalCost: 6, items: [line] },
  },
};

test("reads a stable complete source mirror and computes its original sale margin", async () => {
  const rpc = (async (_session, model, method) => {
    assert.equal(model, "shopfront.sync.sale");
    if (method === "search_count") return 1;
    return [sourceSale];
  }) as ReportRpc;
  const result = await readShopfrontReportMargin(rpc, "session", "skr", "2026-11-02 00:00:00", "2026-11-03 00:00:00");
  assert.deepEqual(result, { grossMarginPercent: 0.4, grossSales: 11, tax: 1, netSales: 10, salesCost: 6, completedOrders: 1, coverage: 1 });
});

test("does not publish a margin when the source mirror changes during pagination", async () => {
  let counts = 0;
  const rpc = (async (_session, model, method) => {
    assert.equal(model, "shopfront.sync.sale");
    if (method === "search_count") return ++counts === 1 ? 1 : 2;
    return [sourceSale];
  }) as ReportRpc;
  assert.equal(await readShopfrontReportMargin(rpc, "session", "skr", "2026-11-02 00:00:00", "2026-11-03 00:00:00"), null);
});
