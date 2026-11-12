import assert from "node:assert/strict";
import test from "node:test";
import {
  mapShopfrontSalesTrend,
  mergeDailySalesGroups,
  parseShopfrontDailyTrendRow,
  shopfrontSalesHistoryWindow,
} from "./sales-daily.ts";

test("merges sales and refunds for the same day", () => {
  assert.deepEqual(mergeDailySalesGroups([
    { date: "2026-11-02", transactions: 2, amount: 120, tax: 12 },
    { date: "2026-11-02", transactions: 1, amount: -20, tax: -2 },
  ]), [{ date: "2026-11-02", salesTransactions: 2, refundTransactions: 1, salesAmount: 120, refundAmount: 20, netSales: 100, tax: 10 }]);
});

test("keeps sales-only and refund-only days", () => {
  assert.deepEqual(mergeDailySalesGroups([
    { date: "2026-11-01", transactions: 1, amount: -10, tax: -1 },
    { date: "2026-11-03", transactions: 3, amount: 90, tax: 9 },
  ]), [
    { date: "2026-11-03", salesTransactions: 3, refundTransactions: 0, salesAmount: 90, refundAmount: 0, netSales: 90, tax: 9 },
    { date: "2026-11-01", salesTransactions: 0, refundTransactions: 1, salesAmount: 0, refundAmount: 10, netSales: -10, tax: -1 },
  ]);
});

test("returns no rows when the selected period has no sales", () => {
  assert.deepEqual(mergeDailySalesGroups([]), []);
});

test("maps Shopfront sales-trend revenue to Sales History daily rows", () => {
  assert.deepEqual(parseShopfrontDailyTrendRow({
    date: "2026-11-09",
    revenue: "5038.4800",
    tax: "432.9300",
    transaction_count: 162,
  }), {
    date: "2026-11-09",
    salesTransactions: 162,
    refundTransactions: 0,
    salesAmount: 5038.48,
    refundAmount: 0,
    netSales: 5038.48,
    tax: 432.93,
  });
});

test("Shopfront daily history paginates newest-first and hides non-completed statuses", () => {
  const page = mapShopfrontSalesTrend([
    { date: "2026-11-08", revenue: 3652.71, tax: 312.5, transaction_count: 114 },
    { date: "2026-11-09", revenue: 5038.48, tax: 432.93, transaction_count: 162 },
  ], { limit: 1, offset: 0 });
  assert.equal(page.total, 2);
  assert.equal(page.items[0]?.date, "2026-11-09");
  assert.equal(page.items[0]?.netSales, 5038.48);
  assert.deepEqual(mapShopfrontSalesTrend([{ date: "2026-11-09", revenue: 1, tax: 0, transaction_count: 1 }], { status: "refunded" }), {
    items: [],
    total: 0,
  });
});

test("Shopfront history windows use store business days", () => {
  const now = new Date("2026-11-10T06:00:00Z");
  assert.deepEqual(shopfrontSalesHistoryWindow({ timezone: "Australia/Adelaide", period: "7d", now }), {
    from: "2026-11-04",
    to: "2026-11-10",
  });
  assert.deepEqual(shopfrontSalesHistoryWindow({
    timezone: "Australia/Adelaide",
    fromDate: "2026-11-09",
    toDate: "2026-11-09",
    now,
  }), { from: "2026-11-09", to: "2026-11-09" });
});
