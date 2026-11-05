import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileSalesAmounts } from "./sales-report-reconciliation.ts";

test("sales totals reconcile after cent rounding", () => {
  assert.deepEqual(reconcileSalesAmounts(12.1, 12.100000000000001), {
    orderGrossAmount: 12.1,
    groupedAmount: 12.1,
    difference: 0,
    reconcilesToCent: true,
  });
});

test("sales totals disclose a real order-to-line difference", () => {
  assert.deepEqual(reconcileSalesAmounts(100, 99.97), {
    orderGrossAmount: 100,
    groupedAmount: 99.97,
    difference: -0.03,
    reconcilesToCent: false,
  });
});

test("non-finite report totals are rejected", () => {
  assert.throws(() => reconcileSalesAmounts(Number.NaN, 0), /finite numbers/);
});
