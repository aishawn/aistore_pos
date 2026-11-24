import { test } from "node:test";
import assert from "node:assert/strict";
import { inventoryHistoryFieldLabel, inventoryHistoryHasQualityGaps, inventoryHistoryNeedsAttention } from "./inventory-history-quality";

test("fresh inventory capture with missing product fields still needs attention", () => {
  const history = { status: "FRESH", missingFields: { availableQty: 5371 } } as const;
  assert.equal(inventoryHistoryHasQualityGaps(history), true);
  assert.equal(inventoryHistoryNeedsAttention(history), true);
});

test("fresh complete inventory history does not raise a quality warning", () => {
  const history = { status: "FRESH", missingFields: {}, missingWarehouseQuantityFields: 0, gapDays: 0, invalidSnapshots: 0 } as const;
  assert.equal(inventoryHistoryHasQualityGaps(history), false);
  assert.equal(inventoryHistoryNeedsAttention(history), false);
});

test("stale inventory history needs attention even when its fields are complete", () => {
  const history = { status: "STALE", missingFields: {} } as const;
  assert.equal(inventoryHistoryHasQualityGaps(history), false);
  assert.equal(inventoryHistoryNeedsAttention(history), true);
});

test("labels the available quantity quality count as negative stock", () => {
  assert.equal(inventoryHistoryFieldLabel("availableQty"), "negative on-hand stock");
  assert.equal(inventoryHistoryFieldLabel("unknownField"), "unknownField");
});
