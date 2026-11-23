import assert from "node:assert/strict";
import test from "node:test";
import { formatReportColumnHeader } from "./utils.ts";

test("formats snake case and camel case report fields as readable labels", () => {
  assert.equal(formatReportColumnHeader("qty_sold"), "Qty Sold");
  assert.equal(formatReportColumnHeader("grossProfit"), "Gross profit");
  assert.equal(formatReportColumnHeader("reportDataStatus"), "Data status");
  assert.equal(formatReportColumnHeader("refundTransactions"), "Refund transactions");
  assert.equal(formatReportColumnHeader("营业额"), "营业额");
});
