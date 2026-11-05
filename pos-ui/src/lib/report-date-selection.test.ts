import assert from "node:assert/strict";
import test from "node:test";
import { comparisonDateRange, reportDatePreset } from "./report-date-selection.ts";

test("Today preset uses the store business date across the UTC date boundary", () => {
  assert.deepEqual(reportDatePreset("today", new Date("2026-11-05T13:45:00Z")), { from: "2026-11-06", to: "2026-11-06" });
});

test("date presets cover the requested inclusive store days", () => {
  const now = new Date("2026-11-05T00:30:00Z");
  assert.deepEqual(reportDatePreset("last_7_days", now), { from: "2026-10-30", to: "2026-11-05" });
  assert.deepEqual(reportDatePreset("last_30_days", now), { from: "2026-10-07", to: "2026-11-05" });
});

test("previous period is equal in length and ends the day before the selected range", () => {
  assert.deepEqual(comparisonDateRange("2026-11-01", "2026-11-05", "previous_period"), { from: "2026-10-27", to: "2026-10-31" });
});

test("last-year comparison clamps leap day and preserves selected range length", () => {
  assert.deepEqual(comparisonDateRange("2024-02-29", "2024-03-02", "last_year"), { from: "2023-02-28", to: "2023-03-02" });
});

test("no comparison and invalid ranges return no comparison dates", () => {
  assert.equal(comparisonDateRange("2026-11-05", "2026-11-05", "none"), null);
  assert.equal(comparisonDateRange("2026-11-06", "2026-11-05", "previous_period"), null);
});
