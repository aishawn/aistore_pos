import assert from "node:assert/strict";
import test from "node:test";
import { netMargin, simpleTaxTotals, suggestedListPrice, type SuggestionTax } from "./price-suggestion-math.ts";

const includedGst: SuggestionTax = {
  id: 1,
  amount: 10,
  amount_type: "percent",
  price_include: true,
  include_base_amount: false,
};

const excludedGst: SuggestionTax = { ...includedGst, id: 2, price_include: false };

test("rounds a GST-inclusive shelf suggestion up to a five-cent price", () => {
  const shelfPrice = suggestedListPrice(10, 0.3, [includedGst]);
  assert.equal(shelfPrice, 15.75);
  assert.deepEqual(simpleTaxTotals(shelfPrice!, [includedGst]), {
    total_excluded: 14.32,
    total_included: 15.75,
  });
  assert.ok(netMargin(simpleTaxTotals(shelfPrice!, [includedGst])!.total_excluded, 10)! >= 0.3);
});

test("keeps tax-exclusive list prices cent-rounded and adds GST for display", () => {
  const listPrice = suggestedListPrice(10, 0.3, [excludedGst]);
  assert.equal(listPrice, 14.29);
  assert.deepEqual(simpleTaxTotals(listPrice!, [excludedGst]), {
    total_excluded: 14.29,
    total_included: 15.72,
  });
});

test("supports additive percentage taxes that do not affect the tax base", () => {
  const taxes = [includedGst, { ...includedGst, id: 3, amount: 5 }];
  const shelfPrice = suggestedListPrice(10, 0.3, taxes);
  const totals = simpleTaxTotals(shelfPrice!, taxes);
  assert.equal(shelfPrice, 16.45);
  assert.deepEqual(totals, { total_excluded: 14.3, total_included: 16.45 });
  assert.ok(netMargin(totals!.total_excluded, 10)! >= 0.3);
});

test("returns no estimate for invalid inputs or complex tax configurations", () => {
  assert.equal(suggestedListPrice(0, 0.3, [includedGst]), null);
  assert.equal(suggestedListPrice(10, 0, [includedGst]), null);
  assert.equal(suggestedListPrice(10, 1, [includedGst]), null);
  assert.equal(suggestedListPrice(10, 0.3, []), null);
  assert.equal(simpleTaxTotals(0, [includedGst]), null);
  assert.equal(simpleTaxTotals(10, []), null);
  assert.equal(simpleTaxTotals(10, [{ ...includedGst, amount_type: "fixed" }]), null);
  assert.equal(simpleTaxTotals(10, [{ ...includedGst, include_base_amount: true }]), null);
  assert.equal(simpleTaxTotals(10, [includedGst, excludedGst]), null);
  assert.equal(netMargin(0, 10), null);
  assert.equal(netMargin(10, 0), null);
});
