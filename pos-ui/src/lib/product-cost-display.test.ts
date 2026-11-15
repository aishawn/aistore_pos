import assert from "node:assert/strict";
import test from "node:test";
import { productCostDisplay } from "./product-cost-display.ts";

test("shows Shopfront case cost and the case-size-derived item cost", () => {
  assert.deepEqual(productCostDisplay(71.01, 12), {
    caseCost: "A$ 71.01 / case",
    itemCost: "A$ 5.9175 / item",
  });
});

test("keeps a source zero distinct from a missing cost", () => {
  assert.deepEqual(productCostDisplay(0, 6), {
    caseCost: "A$ 0.00 / case",
    itemCost: "A$ 0.00 / item",
  });
  assert.equal(productCostDisplay(null, 6), null);
});

test("does not invent an item cost when Shopfront case size is invalid", () => {
  assert.deepEqual(productCostDisplay(24, 0), {
    caseCost: "A$ 24.00 / case",
    itemCost: null,
  });
});

test("does not present an inactive Shopfront product cost as current", () => {
  assert.deepEqual(productCostDisplay(71.01, 12, "NOT_ACTIVE"), {
    caseCost: "Unavailable",
    itemCost: "Not in current Shopfront catalogue",
  });
});
