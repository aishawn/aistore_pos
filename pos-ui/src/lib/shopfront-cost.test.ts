import test from "node:test";
import assert from "node:assert/strict";
import { shopfrontCostValue } from "./shopfront-cost.ts";

test("keeps a verified zero Shopfront cost distinct from missing cost", () => {
  assert.equal(shopfrontCostValue(0), 0);
  assert.equal(shopfrontCostValue(12.5), 12.5);
  assert.equal(shopfrontCostValue(null), null);
  assert.equal(shopfrontCostValue(undefined), null);
  assert.equal(shopfrontCostValue(Number.NaN), null);
  assert.equal(shopfrontCostValue(Number.POSITIVE_INFINITY), null);
});
