import assert from "node:assert/strict";
import test from "node:test";
import { inventoryTotals, sortInventory, type InventoryRow } from "./inventory-report.ts";
import { getInventorySnapshot, saveInventorySnapshot } from "./inventory-snapshot.ts";

const row = (id: number, qty = 1, cost: number | false = 2): InventoryRow => ({ id, name: `Wine ${id}`, qty_available: qty, standard_price: cost, pos_categ_ids: [1], uom_id: [1, "Units"], price_included: 12 });

test("full totals include negative/fractional stock and round decimal cost only once", () => {
  assert.deepEqual(inventoryTotals([row(1, 2.5, 1.23), row(2, -1, 0.07), row(3, 0, false)]), {
    totalItems: 3, totalQty: 1.5, totalStockValue: 3.01, missingCostItems: 0, mixedUnits: false,
  });
  assert.equal(inventoryTotals([row(1, -1, 1.005)]).totalStockValue, -1.01);
  assert.equal(inventoryTotals([row(1, 1, 1.005)]).totalStockValue, 1.01);
  assert.equal(inventoryTotals([row(1, 1e-7, 1e7)]).totalStockValue, 1);
});

test("missing cost is distinguished from valid zero cost", () => {
  assert.equal(inventoryTotals([row(1, 3, 0)]).totalStockValue, 0);
  const totals = inventoryTotals([row(1, 3, false), row(2)]);
  assert.equal(totals.totalStockValue, null);
  assert.equal(totals.missingCostItems, 1);
  assert.equal(inventoryTotals([]).totalStockValue, 0);
  assert.throws(() => inventoryTotals([row(1, NaN)]));
});

test("different units are not silently summed", () => {
  const totals = inventoryTotals([row(1), { ...row(2), uom_id: [2, "kg"] }]);
  assert.equal(totals.totalQty, null);
  assert.equal(totals.mixedUnits, true);
  assert.equal(totals.totalStockValue, 4);
});

test("global quantity and name order has a deterministic id tie break", () => {
  const rows = [row(3, -1), row(2, 1.5), row(1, 1.5), row(10, 4)];
  assert.deepEqual(sortInventory(rows, "qty_available", "desc", new Map()).map((p) => p.id), [10, 1, 2, 3]);
  assert.deepEqual(sortInventory(rows, "name", "asc", new Map()).map((p) => p.id), [1, 2, 3, 10]);
  assert.deepEqual(rows.map((p) => p.id), [3, 2, 1, 10]);
});

test("category names and GST-inclusive prices determine ordering; unknown quotes last", () => {
  const rows = [{ ...row(1), pos_categ_ids: [2], price_included: 22 }, { ...row(2), price_included: 20 }, { ...row(3), price_included: null }];
  assert.deepEqual(sortInventory(rows, "category", "asc", new Map([[1, "Wine"], [2, "Beer"]])).map((p) => p.id), [1, 2, 3]);
  assert.deepEqual(sortInventory(rows, "price_included", "asc", new Map()).map((p) => p.id), [2, 1, 3]);
  assert.deepEqual(sortInventory(rows, "price_included", "desc", new Map()).map((p) => p.id), [1, 2, 3]);
});

test("name ordering matches displayed labels after removing import prefixes", () => {
  const rows = [{ ...row(1), name: "Zebra", display_name: "R2 TEST | Apple" }, { ...row(2), name: "Banana" }];
  assert.deepEqual(sortInventory(rows, "name", "asc", new Map()).map((p) => p.id), [1, 2]);
});

test("snapshots are query/session bound, expire, and are bounded", () => {
  const rows = [row(1)];
  const token = saveInventorySnapshot("session-company-query-sort", rows, inventoryTotals(rows), 0);
  assert.ok(getInventorySnapshot(token, "session-company-query-sort", 1));
  assert.equal(getInventorySnapshot(token, "other-session", 1), null);
  assert.equal(getInventorySnapshot(token, "session-company-query-sort", 300_000), null);
  for (let index = 0; index < 32; index += 1) saveInventorySnapshot("other", rows, inventoryTotals(rows), 1);
  assert.equal(getInventorySnapshot(token, "session-company-query-sort", 1), null);
});
