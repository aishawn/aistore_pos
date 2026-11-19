import assert from "node:assert/strict";
import test from "node:test";
import {
  comparisonDateRange,
  matchReportDatePreset,
  readReportRangeFromSearch,
  reportDatePreset,
} from "./report-date-selection.ts";

test("Today preset uses the store business date across the UTC date boundary", () => {
  assert.deepEqual(reportDatePreset("today", new Date("2026-11-05T13:45:00Z")), { from: "2026-11-06", to: "2026-11-06" });
});

test("Today preset follows Melbourne instead of Adelaide around its midnight boundary", () => {
  const now = new Date("2026-11-05T13:15:00Z");
  assert.deepEqual(reportDatePreset("today", now, "Australia/Melbourne"), { from: "2026-11-06", to: "2026-11-06" });
  assert.deepEqual(reportDatePreset("today", now, "Australia/Adelaide"), { from: "2026-11-05", to: "2026-11-05" });
});

test("Yesterday preset is the previous Adelaide business day", () => {
  assert.deepEqual(reportDatePreset("yesterday", new Date("2026-11-05T13:45:00Z")), { from: "2026-11-05", to: "2026-11-05" });
});

test("date presets cover the requested inclusive store days", () => {
  const now = new Date("2026-11-05T00:30:00Z");
  assert.deepEqual(reportDatePreset("last_7_days", now), { from: "2026-10-30", to: "2026-11-05" });
  assert.deepEqual(reportDatePreset("last_30_days", now), { from: "2026-10-07", to: "2026-11-05" });
  assert.deepEqual(reportDatePreset("this_month", now), { from: "2026-11-01", to: "2026-11-05" });
});

test("matchReportDatePreset detects named ranges and falls back to custom", () => {
  const now = new Date("2026-11-05T00:30:00Z");
  assert.equal(matchReportDatePreset("2026-11-05", "2026-11-05", now), "today");
  assert.equal(matchReportDatePreset("2026-11-04", "2026-11-04", now), "yesterday");
  assert.equal(matchReportDatePreset("2026-10-01", "2026-10-15", now), "custom");
});

test("readReportRangeFromSearch maps legacy period names and custom from/to", () => {
  const now = new Date("2026-11-05T00:30:00Z");
  assert.deepEqual(readReportRangeFromSearch("?period=last_week", now), {
    period: "last_7_days",
    from: "2026-10-30",
    to: "2026-11-05",
  });
  assert.deepEqual(readReportRangeFromSearch("?period=last_month", now), {
    period: "this_month",
    from: "2026-11-01",
    to: "2026-11-05",
  });
  assert.deepEqual(readReportRangeFromSearch("?from=2026-10-01&to=2026-10-03", now), {
    period: "custom",
    from: "2026-10-01",
    to: "2026-10-03",
  });
  assert.deepEqual(readReportRangeFromSearch("", now), {
    period: "last_7_days",
    from: "2026-10-30",
    to: "2026-11-05",
  });
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
