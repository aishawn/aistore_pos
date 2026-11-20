import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  melbourneBusinessDate,
  parseDynamicReportFixtures,
  resolveDynamicReportPeriod,
} from "./dynamic-report-periods.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const fixturesPath = path.join(directory, "fixtures", "dynamic-report-utterances.jsonl");

test("dynamic report fixtures define six fact questions with supported period and metric contracts", () => {
  const cases = parseDynamicReportFixtures(fs.readFileSync(fixturesPath, "utf8"));

  assert.equal(cases.length, 6);
  assert.deepEqual(cases.map(({ id }) => id), [
    "aov-this-week-zh",
    "sales-this-month-zh",
    "sales-last-7-en",
    "aov-last-week-en",
    "aov-this-month-en",
    "aov-last-month-zh",
  ]);
  assert.ok(cases.every(({ expected }) => ["sales", "aov"].includes(expected.metric)));
});

test("dynamic report windows use inclusive Melbourne business dates", () => {
  assert.deepEqual(resolveDynamicReportPeriod("current_month", "2026-11-21"), {
    from: "2026-11-01", to: "2026-11-21",
  });
  assert.deepEqual(resolveDynamicReportPeriod("last_7_days", "2026-11-21"), {
    from: "2026-11-15", to: "2026-11-21",
  });
  assert.deepEqual(resolveDynamicReportPeriod("current_week", "2026-11-21"), {
    from: "2026-11-16", to: "2026-11-21",
  });
  assert.deepEqual(resolveDynamicReportPeriod("previous_week", "2026-11-21"), {
    from: "2026-11-09", to: "2026-11-15",
  });
  assert.deepEqual(resolveDynamicReportPeriod("previous_month", "2026-11-21"), {
    from: "2026-10-01", to: "2026-10-31",
  });
  assert.deepEqual(resolveDynamicReportPeriod("previous_month", "2024-03-01"), {
    from: "2024-02-01", to: "2024-02-29",
  });
});

test("Melbourne business date respects the daylight-saving midnight boundary", () => {
  assert.equal(melbourneBusinessDate(new Date("2026-11-20T12:59:00Z")), "2026-11-20");
  assert.equal(melbourneBusinessDate(new Date("2026-11-20T13:00:00Z")), "2026-11-21");
});

test("rejects unsupported or malformed dynamic report fixtures", () => {
  assert.throws(() => resolveDynamicReportPeriod("rolling_30_days", "2026-11-21"), /UNSUPPORTED_REPORT_PERIOD/);
  assert.throws(() => resolveDynamicReportPeriod("current_month", "21-11-2026"), /INVALID_BUSINESS_DATE/);
  assert.throws(() => parseDynamicReportFixtures("\n  \r\n"), /EMPTY_DYNAMIC_REPORT_FIXTURES/);
  const validCase = JSON.stringify({
    id: "x", question: "monthly sales", expected: { intent: "report_sales", metric: "sales", period: "current_month" },
  });
  assert.throws(() => parseDynamicReportFixtures(`${validCase}\n${validCase}`), /DUPLICATE_REPORT_CASE_ID/);
});
