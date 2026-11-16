import assert from "node:assert/strict";
import test from "node:test";
import { productCostDisplay } from "./product-cost-display.ts";

test("shows POS item cost and derives Shopfront case cost from pack size", () => {
  assert.deepEqual(productCostDisplay(71.01, 12), {
    caseCost: "A$ 852.12 / case",
    itemCost: "A$ 71.01 / item",
  });
});

test("keeps a source zero distinct from a missing cost", () => {
  assert.deepEqual(productCostDisplay(0, 6), {
    caseCost: "A$ 0.00 / case",
    itemCost: "A$ 0.00 / item",
  });
  assert.equal(productCostDisplay(null, 6), null);
});

test("shows item cost but does not invent case cost when pack size is invalid", () => {
  assert.deepEqual(productCostDisplay(24, 0), {
    caseCost: null,
    itemCost: "A$ 24.00 / item",
  });
});

test("does not present an inactive Shopfront product cost as current", () => {
  assert.deepEqual(productCostDisplay(71.01, 12, "NOT_ACTIVE"), {
    caseCost: "Unavailable",
    itemCost: "Not in current Shopfront catalogue",
  });
});
