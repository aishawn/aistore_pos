import assert from "node:assert/strict";
import test from "node:test";
import { inventoryHistoryHasDailySamples } from "./inventory-history-quality.ts";

test("daily inventory samples require dated observations", () => {
  assert.equal(inventoryHistoryHasDailySamples({ status: "FRESH", observedDays: 0 }), false);
  assert.equal(inventoryHistoryHasDailySamples({
    status: "FRESH",
    firstBusinessDate: "2026-11-24",
    latestBusinessDate: "2026-11-25",
    observedDays: 2,
  }), true);
});
