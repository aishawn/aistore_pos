import test from "node:test";
import assert from "node:assert/strict";
import { parseShopfrontInventoryReport, parseShopfrontSalesReport, reconcileShopfrontSales, shopfrontInventorySnapshotIsFresh } from "./shopfront-dashboard-metrics.ts";

test("Shopfront sales KPI validates source Profit and computes margin from Revenue minus COGS", () => {
  const result = parseShopfrontSalesReport({
    data: [{ Revenue: 4494.56, "Cost of Goods Sold": 3074.14, Profit: 1420.42, "Profit Percentage": "31.60%", "Transaction Count": 164 }],
    pagination: { total: 1, returned: 1 }, fetched_at: "2026-11-05T14:00:00Z",
  });
  assert.equal(result?.revenue, 4494.56);
  assert.equal(result?.cost, 3074.14);
  assert.equal(result?.calculatedProfit, 1420.42);
  assert.equal(result?.reportedProfit, 1420.42);
  assert.equal(result?.profitDelta, 0);
  assert.ok(Math.abs((result?.grossMargin ?? 0) - (4494.56 - 3074.14) / 4494.56) < 1e-12);
  assert.equal(result?.transactionCount, 164);
  assert.equal(result?.fetchedAt, "2026-11-05T14:00:00Z");
});

test("reported profit is comparison-only when it differs within source rounding tolerance", () => {
  const result = parseShopfrontSalesReport({
    data: [{ Revenue: 100, "Cost of Goods Sold": 60, Profit: 40.01, "Profit Percentage": "40.01%", "Transaction Count": 1 }],
    pagination: { total: 1, returned: 1 },
  });
  assert.equal(result?.calculatedProfit, 40);
  assert.equal(result?.reportedProfit, 40.01);
  assert.equal(result?.profitDelta, -0.01);
  assert.equal(result?.grossMargin, 0.4);
});

test("incomplete and internally inconsistent Shopfront reports are not displayed as exact", () => {
  assert.equal(parseShopfrontSalesReport({ data: [], pagination: { total: 1, returned: 0 } }), null);
  assert.equal(parseShopfrontSalesReport({ data: [{ Revenue: 100, "Cost of Goods Sold": 30, Profit: 60, "Profit Percentage": 60, "Transaction Count": 1 }], pagination: { total: 1, returned: 1 } }), null);
  assert.equal(parseShopfrontInventoryReport({ available: false, reason: "snapshot_incomplete" }), null);
  assert.equal(parseShopfrontInventoryReport({ available: true, sellable_units: 20, negative_stock_products: 2, record_count: 4, outlet_count: 2 }), null);
});

test("inventory KPI uses the durable single-outlet snapshot summary", () => {
  const now = Date.parse("2026-11-06T12:00:00Z");
  const result = parseShopfrontInventoryReport({
    available: true, sellable_units: 49993, negative_stock_products: 7076,
    record_count: 10849, outlet_count: 1, snapshot_at: "2026-11-05T14:00:00Z",
    source: "shopfront_reporting_api", source_version: "shopfront_reporting_api_v1",
  }, now);
  assert.deepEqual(result, { sellableUnits: 49993, negativeStockProducts: 7076, recordCount: 10849, fetchedAt: "2026-11-05T14:00:00Z" });
});

test("inventory KPI rejects a stale or future snapshot", () => {
  const now = Date.parse("2026-11-06T12:00:00Z");
  assert.equal(shopfrontInventorySnapshotIsFresh("2026-11-05T11:59:59Z", now), false);
  assert.equal(shopfrontInventorySnapshotIsFresh("2026-11-06T12:04:00Z", now), true);
  assert.equal(shopfrontInventorySnapshotIsFresh("2026-11-06T12:06:00Z", now), false);
  assert.equal(parseShopfrontInventoryReport({
    available: true, sellable_units: 100, negative_stock_products: 0,
    record_count: 1, outlet_count: 1, snapshot_at: "2026-11-05T11:59:59Z",
    source: "shopfront_reporting_api", source_version: "shopfront_reporting_api_v1",
  }, now), null);
});

test("inventory KPI rejects legacy snapshot responses even when marked available", () => {
  assert.equal(parseShopfrontInventoryReport({
    available: true, sellable_units: 100, negative_stock_products: 0,
    record_count: 1, outlet_count: 1, snapshot_at: "2026-11-06T11:59:59Z",
    source: "shopfront_inventory_snapshot",
  }), null);
});

test("dashboard reconciliation compares Shopfront sales with Odoo gross totals and transactions", () => {
  const source = parseShopfrontSalesReport({
    data: [{ Revenue: 100, "Cost of Goods Sold": 60, Profit: 40, "Profit Percentage": "40.00%", "Transaction Count": 2 }],
    pagination: { total: 1, returned: 1 },
  });
  assert.equal(reconcileShopfrontSales(source, 100, 2), "matched");
  assert.equal(reconcileShopfrontSales(source, 100, 1), "mismatch");
  assert.equal(reconcileShopfrontSales(null, 100, 2), "unavailable");
});
