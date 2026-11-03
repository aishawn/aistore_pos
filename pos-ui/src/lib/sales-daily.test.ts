import assert from "node:assert/strict";
import test from "node:test";
import { mergeDailySalesGroups, parseDailySalesGroup } from "./sales-daily.ts";

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

test("parses the actual Odoo localized label using its UTC range", () => {
  const row = parseDailySalesGroup({ "date_order:day": "02 Nov 2026", __count: 134, amount_total: 3579.98, amount_tax: 307.67, __range: { "date_order:day": { from: "2026-11-01 13:30:00", to: "2026-11-02 13:30:00" } } }, "Australia/Adelaide");
  assert.equal(row.date, "2026-11-02");
  assert.equal(row.transactions, 134);
});
test("does not report a malformed Odoo bucket as an empty sales history", () => {
  assert.throws(() => parseDailySalesGroup({ "date_order:day": "02 Nov 2026" }, "Australia/Adelaide"));
});
test("handles daylight-saving date boundaries", () => {
  for (const [from, expected] of [["2026-10-03 14:30:00", "2026-10-04"], ["2026-10-04 13:30:00", "2026-10-05"]]) {
    assert.equal(parseDailySalesGroup({ __range: { "date_order:day": { from } } }, "Australia/Adelaide").date, expected);
  }
  assert.deepEqual(mergeDailySalesGroups([]), []);
});
