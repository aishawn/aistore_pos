import assert from "node:assert/strict";
import test from "node:test";
import {
  assistantDataAsOf,
  assistantProvenanceFields,
  assistantReportDateRange,
  assistantRouteLabel,
  formatAssistantDataAsOf,
  latestReportDataDate,
  requestedSalesDateRange,
  returnedReportDateRange,
} from "./assistant-provenance.ts";

test("uses the latest valid report day, not the requested range end", () => {
  assert.equal(latestReportDataDate([
    { date: "28 Oct 2026" },
    { date: "02 Nov 2026" },
    { date: "not a date" },
  ]), "2026-11-02");
});

test("reports actual returned range separately from the latest returned day", () => {
  const rows = [{ date: "28 Oct 2026" }, { date: "02 Nov 2026" }, { date: "bad" }];
  assert.equal(returnedReportDateRange(rows), "2026-10-28 to 2026-11-02");
  assert.equal(latestReportDataDate(rows), "2026-11-02");
  assert.equal(returnedReportDateRange([{ date: "2026-11-02" }]), "2026-11-02");
  assert.equal(returnedReportDateRange([]), null);
});

test("formats the requested sales range only from valid report slots", () => {
  assert.equal(requestedSalesDateRange("report_sales", { from: "2026-10-29", to: "2026-11-04" }), "2026-10-29 to 2026-11-04");
  assert.equal(requestedSalesDateRange("report_sales", { from: "2026-02-30", to: "2026-11-04" }), "2026-11-04");
  assert.equal(requestedSalesDateRange("report_stock", { from: "2026-10-29", to: "2026-11-04" }), null);
});

test("uses the API report period when it is present", () => {
  assert.equal(assistantReportDateRange("2026-11-10", "2026-11-11"), "2026-11-10 to 2026-11-11");
  assert.equal(assistantReportDateRange("2026-11-11", "2026-11-11"), "2026-11-11");
  assert.equal(assistantReportDateRange("bad", "2026-11-11"), null);
});

test("accepts ISO report dates and rejects impossible calendar dates", () => {
  assert.equal(latestReportDataDate([
    { date: "2026-11-01T00:00:00Z" },
    { date: "2026-02-30" },
  ]), "2026-11-01");
});

test("explains routing metadata without presenting it as the data source", () => {
  assert.equal(assistantRouteLabel("deterministic"), "Rule-based route");
  assert.equal(assistantRouteLabel("llm"), "AI-classified route");
  assert.equal(assistantRouteLabel(null), null);
});

test("keeps backend data timestamp separate from returned sales dates", () => {
  assert.equal(assistantDataAsOf("2026-11-03T01:00:00Z"), "2026-11-03T01:00:00Z");
  assert.equal(assistantDataAsOf(null), null);
});

test("preserves API provenance fields for live responses and restored history", () => {
  assert.deepEqual(assistantProvenanceFields({
    source: "deterministic",
    dataSource: "orithos_ledger",
    dataAsOf: "2026-11-12T07:30:00+10:30",
    storeScope: "current_authenticated_store",
    reportPeriodFrom: "2026-11-11",
    reportPeriodTo: "2026-11-11",
    reportTimeZone: "Australia/Adelaide",
    reportDataStatus: "available",
  }), {
    source: "deterministic",
    dataSource: "orithos_ledger",
    dataAsOf: "2026-11-12T07:30:00+10:30",
    storeScope: "current_authenticated_store",
    reportPeriodFrom: "2026-11-11",
    reportPeriodTo: "2026-11-11",
    reportTimeZone: "Australia/Adelaide",
    reportDataStatus: "available",
    requestedDateRange: "2026-11-11",
  });
  assert.deepEqual(assistantProvenanceFields({}), {
    source: null,
    dataSource: null,
    dataAsOf: null,
    storeScope: null,
    reportPeriodFrom: null,
    reportPeriodTo: null,
    reportTimeZone: null,
    reportDataStatus: null,
    requestedDateRange: null,
  });
});

test("keeps date-only provenance timezone-stable", () => {
  assert.equal(formatAssistantDataAsOf("2026-11-02"), "2026-11-02");
});
