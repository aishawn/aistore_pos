import assert from "node:assert/strict";
import test from "node:test";
import { naturalCompare, naturalSortRows } from "./natural-sort.ts";

test("naturalCompare sorts numeric strings by numeric value", () => {
  assert.deepEqual(["10", "2", "1"].sort(naturalCompare), ["1", "2", "10"]);
});

test("naturalCompare sorts mixed labels alphabetically with natural number groups", () => {
  assert.deepEqual(["Item 10", "item 2", "Alpha 1"].sort(naturalCompare), [
    "Alpha 1",
    "item 2",
    "Item 10",
  ]);
});

test("naturalCompare places empty values after populated values", () => {
  assert.deepEqual([null, "", "A", undefined, "B"].sort(naturalCompare), [
    "A",
    "B",
    null,
    "",
    undefined,
  ]);
});

test("naturalCompare treats whitespace-only labels as empty", () => {
  assert.deepEqual(["  ", "Alpha", "", "Beta"].sort(naturalCompare), [
    "Alpha",
    "Beta",
    "  ",
    "",
  ]);
});

test("naturalCompare sorts numbers and ISO dates by their values", () => {
  assert.deepEqual([10, 2, 1].sort(naturalCompare), [1, 2, 10]);
  assert.deepEqual(
    ["2026-11-13", "2026-02-01", "2025-12-31"].sort(naturalCompare),
    ["2025-12-31", "2026-02-01", "2026-11-13"],
  );
});

test("naturalCompare sorts Australian date strings chronologically", () => {
  assert.deepEqual(
    ["13/11/2026", "01/02/2026", "31/12/2025"].sort(naturalCompare),
    ["31/12/2025", "01/02/2026", "13/11/2026"],
  );
});

test("naturalCompare sorts ISO timestamps by instant across timezone offsets", () => {
  assert.deepEqual(
    ["2026-11-13T02:00:00-05:00", "2026-11-13T06:00:00Z"].sort(naturalCompare),
    ["2026-11-13T06:00:00Z", "2026-11-13T02:00:00-05:00"],
  );
});

test("naturalCompare sorts currency strings numerically and keeps invalid dates lexical", () => {
  assert.deepEqual(["$10.00", "$2.50", "$1.00"].sort(naturalCompare), ["$1.00", "$2.50", "$10.00"]);
  assert.deepEqual(["31/02/2026", "01/02/2026"].sort(naturalCompare), ["01/02/2026", "31/02/2026"]);
});

test("naturalSortRows uses a stable key tie-breaker", () => {
  const rows = [
    { id: 3, name: "same" },
    { id: 1, name: "same" },
    { id: 2, name: "other" },
  ];
  assert.deepEqual(naturalSortRows(rows, (row) => row.name, (row) => row.id).map((row) => row.id), [2, 1, 3]);
});
