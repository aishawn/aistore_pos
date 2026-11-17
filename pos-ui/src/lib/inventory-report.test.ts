import assert from "node:assert/strict";
import test from "node:test";
import {
  filterOnHandRows,
  groupOnHandRows,
  inventoryLevelParam,
  inventoryTotals,
  inventoryValueIncLast,
  onHandFooterTotals,
  onHandSummaryToTotals,
  sortInventory,
  sortOnHandRows,
  splitCaseItemLevels,
  toOnHandRow,
  type InventoryRow,
} from "./inventory-report.ts";
import { getInventorySnapshot, saveInventorySnapshot } from "./inventory-snapshot.ts";

const row = (id: number, qty = 1, cost: number | false = 2): InventoryRow => ({ id, name: `Wine ${id}`, qty_available: qty, standard_price: cost, pos_categ_ids: [1], uom_id: [1, "Units"], price_included: 12 });

test("available units exclude negative balances while valuation keeps their signed cost", () => {
  assert.deepEqual(inventoryTotals([row(1, 2.5, 1.23), row(2, -1, 0.07), row(3, 0, false)]), {
    totalItems: 3, totalQty: 2.5, negativeStockItems: 1, totalStockValue: 3.01, missingCostItems: 0, mixedUnits: false,
  });
  assert.equal(inventoryTotals([row(1, -5), row(2, -2), row(3, 4)]).totalQty, 4);
  assert.equal(inventoryTotals([row(1, -5), row(2, -2), row(3, 4)]).negativeStockItems, 2);
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
  assert.equal(totals.negativeStockItems, 0);
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

test("inventory snapshots retain the Shopfront coverage summary for every page", () => {
  const coverage = {
    activeProducts: 10849, productsWithCost: 10171, zeroCostProducts: 856,
    mappedProducts: 10849, unmappedProducts: 0, ambiguousReferences: 5,
    positiveInventoryUnits: 50914, negativeInventoryRows: 5374,
    inventoryProductRows: 10849, inventorySnapshotAt: "2026-11-08T02:34:46+08:00",
  };
  const id = saveInventorySnapshot("shopfront-coverage", [], inventoryTotals([]), 1000, coverage);
  assert.deepEqual(getInventorySnapshot(id, "shopfront-coverage", 1001)?.shopfrontCoverage, coverage);
});

test("case/item split matches Shopfront levels including negative remainders", () => {
  assert.deepEqual(splitCaseItemLevels(278, 24), { caseLevel: 11, itemLevel: 14 });
  assert.deepEqual(splitCaseItemLevels(-5, 12), { caseLevel: 0, itemLevel: -5 });
  assert.deepEqual(splitCaseItemLevels(-15, 12), { caseLevel: -1, itemLevel: -3 });
  assert.deepEqual(splitCaseItemLevels(4, null), { caseLevel: 0, itemLevel: 4 });
  assert.deepEqual(splitCaseItemLevels(null, 12), { caseLevel: null, itemLevel: null });
});

test("value (inc) (last) uses exact case cost or per-item POS cost", () => {
  assert.equal(inventoryValueIncLast(11 * 24 + 14, 1.5, 24), 417);
  assert.equal(inventoryValueIncLast(13, 43.5258, 12, 522.31), 565.84);
  assert.equal(inventoryValueIncLast(0, 12, 6), 0);
  assert.equal(inventoryValueIncLast(3, null, 6), null);
});

test("on-hand rows sort and group like the Shopfront inventory report", () => {
  const rows = [
    toOnHandRow({ id: 2, name: "Zebra", categoryName: "Spirits", brandName: "B", caseQuantity: 6, stockQuantity: 7, cost: 10 }),
    toOnHandRow({ id: 1, name: "Apple", categoryName: "Beer", brandName: "A", caseQuantity: 24, stockQuantity: 48, cost: 2 }),
  ];
  assert.equal(rows[0].caseLevel, 1);
  assert.equal(rows[0].itemLevel, 1);
  assert.equal(rows[0].valueIncLast, 70);
  assert.deepEqual(sortOnHandRows(rows, "name", "asc").map((row) => row.id), ["1", "2"]);
  assert.deepEqual(groupOnHandRows(rows, "category").map((group) => group.label), ["Beer", "Spirits"]);
});

test("report-type filters match Shopfront inventory levels", () => {
  const rows = [
    toOnHandRow({ id: 1, name: "Positive", stockQuantity: 12, caseQuantity: 6, cost: 2 }),
    toOnHandRow({ id: 2, name: "Zero", stockQuantity: 0, caseQuantity: 6, cost: 2 }),
    toOnHandRow({ id: 3, name: "Negative", stockQuantity: -3, caseQuantity: 6, cost: 2 }),
    toOnHandRow({ id: 4, name: "Missing", stockQuantity: null, caseQuantity: 6, cost: 2 }),
  ];
  assert.deepEqual(filterOnHandRows(rows, "on-hand").map((row) => row.id), ["1"]);
  assert.deepEqual(filterOnHandRows(rows, "all").map((row) => row.id), ["1", "2", "3", "4"]);
  assert.deepEqual(filterOnHandRows(rows, "not-zero").map((row) => row.id), ["1", "3"]);
  assert.deepEqual(filterOnHandRows(rows, "only-zero").map((row) => row.id), ["2"]);
  assert.deepEqual(filterOnHandRows(rows, "no-inventory").map((row) => row.id), ["4"]);
});

test("footer totals sum case level, item level, and value", () => {
  const rows = [
    toOnHandRow({ id: 1, name: "A", caseQuantity: 24, stockQuantity: 50, cost: 2 }),
    toOnHandRow({ id: 2, name: "B", caseQuantity: 6, stockQuantity: 7, cost: 10 }),
  ];
  assert.deepEqual(onHandFooterTotals(rows), { caseLevel: 3, itemLevel: 3, valueIncLast: 170 });
});

test("summary API payload maps to full-catalog footer totals", () => {
  assert.deepEqual(
    onHandSummaryToTotals({
      caseLevelTotal: "151",
      itemLevelTotal: 1558,
      valueIncLastTotal: "390107.42",
    }),
    { caseLevel: 151, itemLevel: 1558, valueIncLast: 390107.42 },
  );
  assert.deepEqual(onHandSummaryToTotals(null), { caseLevel: 0, itemLevel: 0, valueIncLast: 0 });
});

test("inventoryLevelParam only forwards filtered report types", () => {
  assert.equal(inventoryLevelParam("on-hand"), "on-hand");
  assert.equal(inventoryLevelParam("all"), undefined);
  assert.equal(inventoryLevelParam("not-zero"), "not-zero");
  assert.equal(inventoryLevelParam("only-zero"), "only-zero");
  assert.equal(inventoryLevelParam("no-inventory"), "no-inventory");
});
