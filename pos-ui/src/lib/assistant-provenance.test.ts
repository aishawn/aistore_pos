import assert from "node:assert/strict";
import test from "node:test";
import {
  assistantDataAsOf,
  assistantDataTimestampLabel,
  assistantCardDisplayStatus,
  assistantProvenanceFields,
  assistantReturnedSalesDateSummary,
  assistantReportDataStatus,
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

test("distinguishes missing sales rows from aggregated rows without dates", () => {
  assert.equal(assistantReturnedSalesDateSummary([], false), "No sales rows returned");
  assert.equal(assistantReturnedSalesDateSummary([{ Metric: "Sales", Value: "123.45" }], false),
    "Sales data was returned without readable daily dates");
  assert.equal(assistantReturnedSalesDateSummary([{ 指标: "营业额", 金额: "123.45" }], true),
    "已返回销售数据，但没有可识别的逐日日期");
  assert.equal(assistantReturnedSalesDateSummary([{ date: "2026-11-12", Sales: "123.45" }], false),
    "Rows span: 2026-11-12 · Latest returned sales date: 2026-11-12");
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
    reportPeriodRange: "2026-11-11",
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
    reportPeriodRange: null,
  });
});

test("localizes report data states without changing unknown backend values", () => {
  assert.equal(assistantReportDataStatus("available", true), "可用");
  assert.equal(assistantReportDataStatus("NO_DATA", false), "No data");
  assert.equal(assistantReportDataStatus("unavailable", true), "暂不可用");
  assert.equal(assistantReportDataStatus("custom_state", false), "custom_state");
  assert.equal(assistantReportDataStatus(null, true), null);
});

test("uses authoritative report data status for assistant card badges", () => {
  assert.deepEqual(assistantCardDisplayStatus("unavailable", "ready", false), {
    tone: "unavailable",
    label: "Unavailable",
  });
  assert.deepEqual(assistantCardDisplayStatus("incomplete", "ready", true), {
    tone: "partial",
    label: "数据不完整",
  });
  assert.deepEqual(assistantCardDisplayStatus("no_data", "ready", true), {
    tone: "empty",
    label: "无数据",
  });
  assert.deepEqual(assistantCardDisplayStatus("available", "unavailable", false), {
    tone: "unavailable",
    label: "Unavailable",
  });
  assert.deepEqual(assistantCardDisplayStatus("available", "partial", true), {
    tone: "partial",
    label: "部分数据需复核",
  });
});

test("keeps card status behavior when the API has no report data status", () => {
  assert.deepEqual(assistantCardDisplayStatus(null, "partial", true), {
    tone: "partial",
    label: "部分数据需复核",
  });
  assert.deepEqual(assistantCardDisplayStatus(null, "empty", false), {
    tone: "empty",
    label: "No suggestions",
  });
});

test("unknown or missing report and card statuses never appear ready", () => {
  assert.deepEqual(assistantCardDisplayStatus("pending_validation", "ready", false), {
    tone: "partial",
    label: "Unknown data status: pending_validation",
  });
  assert.deepEqual(assistantCardDisplayStatus("available", "stale", true), {
    tone: "partial",
    label: "未知卡片状态：stale",
  });
  assert.deepEqual(assistantCardDisplayStatus(null, null, false), {
    tone: "partial",
    label: "Status not provided",
  });
});

test("keeps date-only provenance timezone-stable", () => {
  assert.equal(formatAssistantDataAsOf("2026-11-02"), "2026-11-02");
});

test("states when the backend does not provide a trusted data timestamp", () => {
  assert.equal(assistantDataTimestampLabel(null, true), "数据时间未提供");
  assert.equal(assistantDataTimestampLabel(undefined, false), "Data timestamp unavailable");
  assert.equal(assistantDataTimestampLabel("2026-11-02", true), "2026-11-02");
});
