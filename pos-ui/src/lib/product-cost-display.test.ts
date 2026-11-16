import assert from "node:assert/strict";
import test from "node:test";
import { productCostDisplay } from "./product-cost-display.ts";

test("preserves Shopfront case cost and derives POS item cost from pack size", () => {
  assert.deepEqual(productCostDisplay(55.94, 4, "ACTIVE"), {
    caseCost: "A$ 55.94 / case",
    itemCost: "A$ 13.985 / item",
  });
  assert.deepEqual(productCostDisplay(391.10, 6, "ACTIVE"), {
    caseCost: "A$ 391.10 / case",
    itemCost: "A$ 65.1833 / item",
  });
});

test("keeps a source zero distinct from a missing cost", () => {
  assert.deepEqual(productCostDisplay(0, 6, "ACTIVE"), {
    caseCost: "A$ 0.00 / case",
    itemCost: "A$ 0.00 / item",
  });
  assert.deepEqual(productCostDisplay(null, 6, "ACTIVE"), {
    caseCost: "Unavailable",
    itemCost: "Shopfront cost is missing",
  });
});

test("shows percentage costs without treating them as currency or deriving a unit amount", () => {
  assert.deepEqual(productCostDisplay(35, 6, "ACTIVE", true), {
    caseCost: "35%",
    itemCost: "Percentage cost; no currency amount",
  });
});

test("keeps case cost but does not invent item cost when pack size is invalid", () => {
  assert.deepEqual(productCostDisplay(24, 0, "ACTIVE"), {
    caseCost: "A$ 24.00 / case",
    itemCost: "Unavailable: invalid case quantity",
  });
});

test("does not present a non-active Shopfront product cost as current", () => {
  for (const status of ["NOT_ACTIVE", "NOT_SELLING", "NOT_PURCHASING", "UNKNOWN"]) {
    assert.deepEqual(productCostDisplay(71.01, 12, status), {
      caseCost: "Unavailable",
      itemCost: "Not current in Shopfront catalogue",
    });
  }
  assert.deepEqual(productCostDisplay(71.01, 12, null), {
    caseCost: "Unavailable",
    itemCost: "Shopfront status is unverified",
  });
});

test("does not show an unclassified product cost as current", () => {
  assert.deepEqual(productCostDisplay(71.01, 12), {
    caseCost: "Unavailable",
    itemCost: "Shopfront status is unverified",
  });
});

test("does not show cached cost when the Shopfront catalog has not confirmed the product", () => {
  assert.deepEqual(productCostDisplay(237.09, 50, "ACTIVE", false, false), {
    caseCost: "Unavailable",
    itemCost: "Not confirmed in current Shopfront catalogue",
  });
});
