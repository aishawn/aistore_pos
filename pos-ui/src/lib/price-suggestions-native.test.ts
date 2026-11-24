import assert from "node:assert/strict";
import test from "node:test";
import { buildSuggestion } from "./price-suggestions-native.ts";

const product = { id: 1, name: "GST-free groceries", price: 15, cost: 10, taxRateId: 2 };

test("uses a product's zero-percent GST rate without inventing GST", () => {
  const result = buildSuggestion(product, 0.3, [{ id: 2, amount: 0 }]);
  assert.equal(result.currentNetPrice, 15);
  assert.equal(result.currentGst, 0);
  assert.equal(result.currentMargin, 1 / 3);
  assert.equal(result.status, "ok");
  assert.equal(result.suggestedPrice, null);
});

test("calculates GST-inclusive prices using the product's configured rate", () => {
  const result = buildSuggestion({ ...product, price: 10, cost: 8, taxRateId: 3 }, 0.3, [{ id: 3, amount: 10 }]);
  assert.equal(result.currentNetPrice, 9.09);
  assert.equal(result.currentGst, 0.91);
  assert.equal(result.status, "raise");
  assert.equal(result.suggestedPrice, 12.6);
  assert.equal(result.suggestedGst, 1.15);
});

test("requires tax review when a product tax rate is absent", () => {
  const result = buildSuggestion(product, 0.3, []);
  assert.equal(result.status, "review_tax");
  assert.equal(result.suggestedPrice, null);
});
