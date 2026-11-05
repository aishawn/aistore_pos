import assert from "node:assert/strict";
import test from "node:test";
import { summarizeSalesTotals } from "./sales-report-totals.ts";

test("positive sales and refund orders reconcile to net sales", () => {
  assert.deepEqual(summarizeSalesTotals(3760.72, -3760.72), {
    positiveSales: 3760.72, refunds: 3760.72, netSales: 0,
  });
});

test("refunds display as positive values and reduce net sales", () => {
  assert.deepEqual(summarizeSalesTotals(120.5, -20.25), {
    positiveSales: 120.5, refunds: 20.25, netSales: 100.25,
  });
});

test("totals round to cents", () => {
  assert.deepEqual(summarizeSalesTotals(100.005, -0.004), {
    positiveSales: 100.01, refunds: 0, netSales: 100.01,
  });
});
