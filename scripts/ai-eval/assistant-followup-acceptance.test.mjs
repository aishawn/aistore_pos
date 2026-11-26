import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateSalesFollowup } from "./assistant-followup-cases.mjs";

const nowMs = Date.parse("2026-11-27T01:00:00Z");
const expectedFrom = "2026-11-26";
const assistant = {
  answer: `Sales for ${expectedFrom} were AUD 125.50.`,
  slots: { from: expectedFrom, to: expectedFrom, days: "1" },
  reportPeriodFrom: expectedFrom,
  reportPeriodTo: expectedFrom,
  dataSource: "orithos_ledger",
  storeScope: "current_authenticated_store",
  reportTimeZone: "Australia/Melbourne",
  reportDataStatus: "available",
  dataAsOf: "2026-11-26T08:45:00Z",
  writeRequests: [],
};
const report = {
  source: "orithos_ledger",
  from: expectedFrom,
  to: expectedFrom,
  transactions: 3,
  dailyTrend: [{ date: expectedFrom, revenue: 125.5 }],
  dataAsOf: "2026-11-26T08:45:00Z",
};

test("sales follow-up matches native report, date and freshness provenance", () => {
  const result = evaluateSalesFollowup({
    assistant,
    report,
    expectedFrom,
    timeZone: "Australia/Melbourne",
    nowMs,
  });
  assert.equal(result.passed, true);
  assert.equal(result.answerMatchesNativeReport, true);
  assert.equal(result.noWrites, true);
});

test("historical sales accepts an old watermark only when it matches the native report", () => {
  const matching = evaluateSalesFollowup({
    assistant,
    report,
    expectedFrom,
    timeZone: "Australia/Melbourne",
    nowMs,
  });
  assert.equal(matching.dataAsOfFresh, true);
  assert.equal(matching.passed, true);

  const mismatched = evaluateSalesFollowup({
    assistant: { ...assistant, dataAsOf: "2026-11-26T08:46:00Z" },
    report,
    expectedFrom,
    timeZone: "Australia/Melbourne",
    nowMs,
  });
  assert.equal(mismatched.dataAsOfFresh, false);
  assert.equal(mismatched.passed, false);
});

test("current business day still rejects a matching watermark older than 90 minutes", () => {
  const currentDate = "2026-11-27";
  const currentAsOf = "2026-11-26T21:00:00Z";
  const result = evaluateSalesFollowup({
    assistant: {
      ...assistant,
      answer: `Sales for ${currentDate} were AUD 125.50.`,
      slots: { from: currentDate, to: currentDate, days: "1" },
      reportPeriodFrom: currentDate,
      reportPeriodTo: currentDate,
      dataAsOf: currentAsOf,
    },
    report: {
      ...report,
      from: currentDate,
      to: currentDate,
      dailyTrend: [{ date: currentDate, revenue: 125.5 }],
      dataAsOf: currentAsOf,
    },
    expectedFrom: currentDate,
    timeZone: "Australia/Melbourne",
    nowMs,
  });
  assert.equal(result.dataAsOfFresh, false);
  assert.equal(result.passed, false);
});

test("sales follow-up rejects wrong amount, source, range, status and writes", () => {
  const result = evaluateSalesFollowup({
    assistant: {
      ...assistant,
      answer: `Sales for ${expectedFrom} were AUD 125.51.`,
      dataSource: "other_store",
      reportPeriodTo: "2026-11-27",
      reportDataStatus: "incomplete",
      writeRequests: [{ type: "purchase" }],
    },
    report: { ...report, source: "other_store" },
    expectedFrom,
    timeZone: "Australia/Melbourne",
    nowMs,
  });
  assert.equal(result.answerMatchesNativeReport, false);
  assert.equal(result.nativeReport, false);
  assert.equal(result.dateRange, false);
  assert.equal(result.dataSource, false);
  assert.equal(result.dataStatus, false);
  assert.equal(result.noWrites, false);
  assert.equal(result.passed, false);
});

test("zero-sales follow-up requires an explicit no-data answer", () => {
  const zeroReport = { ...report, transactions: 0, dailyTrend: [] };
  const zeroAssistant = { ...assistant, answer: "No completed sales found for 2026-11-26.", reportDataStatus: "no_data" };
  assert.equal(evaluateSalesFollowup({
    assistant: zeroAssistant,
    report: zeroReport,
    expectedFrom,
    timeZone: "Australia/Melbourne",
    nowMs,
  }).passed, true);
  assert.equal(evaluateSalesFollowup({
    assistant: { ...zeroAssistant, answer: "Sales were AUD 0.00." },
    report: zeroReport,
    expectedFrom,
    timeZone: "Australia/Melbourne",
    nowMs,
  }).answerMatchesNativeReport, false);
});
