import assert from "node:assert/strict";
import test from "node:test";
import { reconcileSourceGrossTotals } from "./report-source-reconciliation.ts";

test("source gross and GST reconcile against positive Odoo orders even when refunds net sales to zero", () => {
  assert.equal(reconcileSourceGrossTotals({
    sourceGross: 3760.72,
    sourceTax: 341.88,
    odooPositiveGross: 3760.72,
    odooPositiveTax: 341.88,
    comparisonBasis: "same_ledger",
  }), "matched");
});

test("either gross or GST difference marks source reconciliation as a mismatch", () => {
  assert.equal(reconcileSourceGrossTotals({
    sourceGross: 3760.72,
    sourceTax: 341.88,
    odooPositiveGross: 3760.72,
    odooPositiveTax: 0,
    comparisonBasis: "same_ledger",
  }), "mismatch");
});

test("missing source or Odoo gross/tax is unavailable rather than zero", () => {
  assert.equal(reconcileSourceGrossTotals({
    sourceGross: null,
    sourceTax: null,
    odooPositiveGross: 0,
    odooPositiveTax: 0,
    comparisonBasis: "same_ledger",
  }), "unavailable");
});

test("Shopfront archive and native Odoo POS totals are separate ledgers", () => {
  assert.equal(reconcileSourceGrossTotals({
    sourceGross: 4068.63,
    sourceTax: 334.36,
    odooPositiveGross: 3760.72,
    odooPositiveTax: 314.12,
    comparisonBasis: "distinct_ledgers",
  }), "not_comparable");
});
