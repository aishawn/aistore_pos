import test from "node:test";
import assert from "node:assert/strict";
import { shopfrontCostDisplayState, shopfrontCostPresentation, shopfrontCostValue } from "./shopfront-cost.ts";

test("keeps a verified zero Shopfront cost distinct from missing cost", () => {
  assert.equal(shopfrontCostValue(0), 0);
  assert.equal(shopfrontCostValue(12.5), 12.5);
  assert.equal(shopfrontCostValue(null), null);
  assert.equal(shopfrontCostValue(undefined), null);
  assert.equal(shopfrontCostValue(Number.NaN), null);
  assert.equal(shopfrontCostValue(Number.POSITIVE_INFINITY), null);
});

test("does not display an unverified local cost as an available Shopfront cost", () => {
  assert.equal(shopfrontCostDisplayState("unavailable", 10.35), "unavailable");
  assert.equal(shopfrontCostDisplayState("restricted", 10.35), "restricted");
  assert.equal(shopfrontCostDisplayState("available", 0), "available");
  assert.equal(shopfrontCostDisplayState("available", null), "missing");
});

test("keeps the Shopfront pack cost primary and derives an optional unit estimate", () => {
  assert.deepEqual(shopfrontCostPresentation(62.07, 6, false), {
    sourceCost: 62.07,
    caseQuantity: 6,
    percentage: false,
    unitEstimate: 10.345,
  });
});

test("does not derive a currency estimate from percentage cost or unknown pack size", () => {
  assert.deepEqual(shopfrontCostPresentation(20, 6, true), {
    sourceCost: 20,
    caseQuantity: 6,
    percentage: true,
    unitEstimate: null,
  });
  assert.deepEqual(shopfrontCostPresentation(4.48, null, false), {
    sourceCost: 4.48,
    caseQuantity: null,
    percentage: false,
    unitEstimate: null,
  });
});
