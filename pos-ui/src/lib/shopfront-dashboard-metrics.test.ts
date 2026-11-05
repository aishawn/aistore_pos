import test from "node:test";
import assert from "node:assert/strict";
import { parseShopfrontInventoryReport, parseShopfrontSalesReport, reconcileShopfrontSales } from "./shopfront-dashboard-metrics.ts";

test("Shopfront sales KPI validates and uses source Profit / Revenue", () => {
  const result = parseShopfrontSalesReport({
    data: [{ Revenue: 4494.56, "Cost of Goods Sold": 3074.14, Profit: 1420.42, "Profit Percentage": "31.60%", "Transaction Count": 164 }],
    pagination: { total: 1, returned: 1 }, fetched_at: "2026-11-05T14:00:00Z",
  });
  assert.equal(result?.revenue, 4494.56);
  assert.ok(Math.abs((result?.grossMargin ?? 0) - 1420.42 / 4494.56) < 1e-12);
  assert.equal(result?.transactionCount, 164);
  assert.equal(result?.fetchedAt, "2026-11-05T14:00:00Z");
});

test("incomplete and internally inconsistent Shopfront reports are not displayed as exact", () => {
  assert.equal(parseShopfrontSalesReport({ data: [], pagination: { total: 1, returned: 0 } }), null);
  assert.equal(parseShopfrontSalesReport({ data: [{ Revenue: 100, "Cost of Goods Sold": 30, Profit: 60, "Profit Percentage": 60, "Transaction Count": 1 }], pagination: { total: 1, returned: 1 } }), null);
  assert.equal(parseShopfrontInventoryReport({ available: false, reason: "snapshot_incomplete" }), null);
  assert.equal(parseShopfrontInventoryReport({ available: true, sellable_units: 20, negative_stock_products: 2, record_count: 4, outlet_count: 2 }), null);
});

test("inventory KPI uses the durable single-outlet snapshot summary", () => {
  const result = parseShopfrontInventoryReport({
    available: true, sellable_units: 49993, negative_stock_products: 7076,
    record_count: 10849, outlet_count: 1, snapshot_at: "2026-11-05T14:00:00Z",
  });
  assert.deepEqual(result, { sellableUnits: 49993, negativeStockProducts: 7076, recordCount: 10849, fetchedAt: "2026-11-05T14:00:00Z" });
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
