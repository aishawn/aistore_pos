import test from "node:test";
import assert from "node:assert/strict";
import { mapNativeProduct } from "./native-product-mapping.ts";
import { shopfrontCostDisplayState, shopfrontCostPresentation, shopfrontCostValue } from "./shopfront-cost.ts";

test("requires a confirmed Shopfront catalog before exposing a source cost", () => {
  const mapped = mapNativeProduct({
    id: 1,
    name: "Historical product",
    status: "ACTIVE",
    cost: 10.35,
    shopfrontSourceUpdatedAt: "2026-11-16T10:00:00Z",
    shopfrontCatalogConfirmed: false,
  });

  assert.equal(mapped.shopfront_cost_status, "unavailable");
  assert.equal(mapped.shopfront_cost, null);
});

test("only exposes confirmed costs while preserving confirmed zero and missing values", () => {
  const base = {
    id: 1,
    name: "Confirmed product",
    status: "ACTIVE",
    shopfrontCatalogConfirmed: true,
    shopfrontSourceUpdatedAt: "2026-11-16T10:00:00Z",
  };

  assert.equal(mapNativeProduct({ ...base, cost: 0, caseCost: 0 }).shopfront_cost_status, "available");
  assert.equal(mapNativeProduct({ ...base, cost: 0, caseCost: 0 }).shopfront_cost, 0);
  assert.equal(mapNativeProduct({ ...base, cost: null }).shopfront_cost_status, "missing");
});

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
