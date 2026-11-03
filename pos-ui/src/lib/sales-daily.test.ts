import assert from "node:assert/strict";
import test from "node:test";
import { mergeDailySalesGroups } from "./sales-daily.ts";

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
