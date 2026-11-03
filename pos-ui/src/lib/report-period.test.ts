import assert from "node:assert/strict";
import test from "node:test";
import { getReportPeriodBounds } from "./report-period.ts";

const iso = (value: Date) => value.toISOString();

test("yesterday uses store midnights and same weekday comparison", () => {
  const bounds = getReportPeriodBounds("yesterday", new Date("2026-11-03T03:00:00Z"), "Australia/Adelaide");
  assert.equal(iso(bounds.start), "2026-11-01T13:30:00.000Z");
  assert.equal(iso(bounds.end), "2026-11-02T13:30:00.000Z");
  assert.equal(iso(bounds.compareStart), "2026-10-25T13:30:00.000Z");
  assert.equal(bounds.trendGranularity, "hour");
});

test("last week starts on Monday", () => {
  const bounds = getReportPeriodBounds("last_week", new Date("2026-11-03T03:00:00Z"), "Australia/Adelaide");
  assert.equal(iso(bounds.start), "2026-10-25T13:30:00.000Z");
  assert.equal(iso(bounds.end), "2026-11-01T13:30:00.000Z");
  assert.equal(iso(bounds.compareStart), "2026-10-18T13:30:00.000Z");
});

test("last month handles year boundaries", () => {
  const bounds = getReportPeriodBounds("last_month", new Date("2026-01-15T03:00:00Z"), "Australia/Adelaide");
  assert.equal(iso(bounds.start), "2025-11-30T13:30:00.000Z");
  assert.equal(iso(bounds.end), "2025-12-31T13:30:00.000Z");
  assert.equal(iso(bounds.compareStart), "2025-10-31T13:30:00.000Z");
});

for (const [now, expectedStart, expectedEnd, hours] of [
  ["2026-10-05T02:00:00Z", "2026-10-03T14:30:00.000Z", "2026-10-04T13:30:00.000Z", 23],
  ["2026-04-06T02:00:00Z", "2026-04-04T13:30:00.000Z", "2026-04-05T14:30:00.000Z", 25],
] as const) {
  test(`yesterday spans ${hours} real hours across Adelaide DST`, () => {
    const bounds = getReportPeriodBounds("yesterday", new Date(now), "Australia/Adelaide");
    assert.equal(iso(bounds.start), expectedStart);
    assert.equal(iso(bounds.end), expectedEnd);
    assert.equal((bounds.end.getTime() - bounds.start.getTime()) / 3_600_000, hours);
    assert.equal(bounds.trendGranularity, "hour");
    assert.equal(bounds.compareEnd.getTime() - bounds.compareStart.getTime(), 24 * 3_600_000);
  });
}

test("Monday returns the previous complete week, even across DST", () => {
  const bounds = getReportPeriodBounds("last_week", new Date("2026-10-05T02:00:00Z"), "Australia/Adelaide");
  assert.equal(iso(bounds.start), "2026-09-27T14:30:00.000Z");
  assert.equal(iso(bounds.end), "2026-10-04T13:30:00.000Z");
  assert.equal(iso(bounds.compareStart), "2026-09-20T14:30:00.000Z");
  assert.equal(iso(bounds.compareEnd), iso(bounds.start));
  assert.equal(bounds.trendGranularity, "day");
});

for (const [year, days] of [[2024, 29], [2026, 28]]) {
  test(`month start returns full February ${year}`, () => {
    const bounds = getReportPeriodBounds("last_month", new Date(`${year}-03-01T02:00:00Z`), "Australia/Adelaide");
    assert.equal(iso(bounds.start), `${year}-01-31T13:30:00.000Z`);
    assert.equal(iso(bounds.end), `${year}-02-${days}T13:30:00.000Z`);
    assert.equal(iso(bounds.compareStart), `${year - 1}-12-31T13:30:00.000Z`);
    assert.equal(iso(bounds.compareEnd), iso(bounds.start));
    assert.equal(bounds.trendGranularity, "day");
  });
}

test("store date takes precedence over UTC or browser date", () => {
  const bounds = getReportPeriodBounds("yesterday", new Date("2026-11-02T14:00:00Z"), "Australia/Adelaide");
  assert.equal(iso(bounds.start), "2026-11-01T13:30:00.000Z");
  assert.equal(iso(bounds.end), "2026-11-02T13:30:00.000Z");
});
