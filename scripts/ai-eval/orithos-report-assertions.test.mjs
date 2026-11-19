import assert from "node:assert/strict";
import test from "node:test";
import {
  assistantReportAcceptance,
  singleProductStockAcceptance,
  nativeOverviewAcceptance,
  productCountAcceptance,
  stockValueHonestyAcceptance,
} from "./orithos-report-assertions.mjs";

const period = { from: "2026-11-16", to: "2026-11-16" };
const report = {
  source: "orithos_ledger",
  dataSource: "orithos_ledger",
  from: period.from,
  to: period.to,
  reportPeriodFrom: period.from,
  reportPeriodTo: period.to,
  timeZone: "Australia/Adelaide",
  reportDataStatus: "available",
  revenue: 4127.55,
  averageSale: 28.47,
};

test("Orithos native overview requires source, Adelaide timezone, date range, and comparable totals", () => {
  assert.deepEqual(nativeOverviewAcceptance(report, period), {
    checks: { source: true, period: true, timezone: true, dataStatus: true, revenue: true },
    passed: true,
  });
  assert.equal(nativeOverviewAcceptance({ ...report, source: "odoo" }, period).passed, false);
});

test("assistant sales answer reconciles with native Orithos revenue and stays read-only", () => {
  const result = assistantReportAcceptance({
    intent: "report_sales",
    dataSource: "orithos_ledger",
    storeScope: "current_authenticated_store",
    reportPeriodFrom: period.from,
    reportPeriodTo: period.to,
    reportTimeZone: "Australia/Adelaide",
    reportDataStatus: "available",
    answer: "Sales were AUD 4,127.55.",
    writeRequests: [],
  }, { ...period, intent: "report_sales", metric: "sales" }, report);
  assert.equal(result.passed, true);
});

test("assistant AOV can reconcile from a structured table", () => {
  const result = assistantReportAcceptance({
    intent: "report_aov",
    dataSource: "orithos_ledger",
    storeScope: "current_authenticated_store",
    reportPeriodFrom: period.from,
    reportPeriodTo: period.to,
    reportTimeZone: "Australia/Adelaide",
    reportDataStatus: "incomplete",
    table: { rows: [{ averageSale: 28.47 }] },
    writeRequests: [],
  }, { ...period, intent: "report_aov", metric: "aov" }, report);
  assert.equal(result.passed, true);
});

test("unreconciled amount, missing provenance, or any write request fails acceptance", () => {
  const assistant = {
    intent: "report_sales",
    dataSource: "orithos_ledger",
    storeScope: "current_authenticated_store",
    reportPeriodFrom: period.from,
    reportPeriodTo: period.to,
    reportTimeZone: "Australia/Adelaide",
    reportDataStatus: "available",
    answer: "Sales were AUD 4,999.00.",
    writeRequests: ["POST /api/sales"],
  };
  const result = assistantReportAcceptance(assistant,
    { ...period, intent: "report_sales", metric: "sales" }, report);
  assert.equal(result.checks.amountMatchesReport, false);
  assert.equal(result.checks.noWrites, false);
  assert.equal(result.passed, false);
});

test("stock value gaps pass only when the incomplete status and reason stay explicit", () => {
  const response = {
    answer: "Inventory value is unavailable because no on-hand products have verifiable positive costs; 3069 products were not valued.",
    reportDataStatus: "incomplete",
    dataSource: "orithos_ledger",
    storeScope: "current_authenticated_store",
    writeRequests: [],
  };
  assert.equal(stockValueHonestyAcceptance(response).passed, true);
  assert.equal(stockValueHonestyAcceptance({ ...response, answer: "Inventory value is AUD 12,345.00." }).passed, false);
  assert.equal(stockValueHonestyAcceptance({ ...response, reportDataStatus: "available" }).passed, false);
});

test("partial stock value accepts a labelled known-cost subtotal without implying a full total", () => {
  const response = {
    answer: "Known-cost on-hand inventory subtotal: AUD 402501.73 across 3080 products; 4 products were not valued, so the complete inventory value is unavailable. Top 8 items subtotal AUD 23379.99.",
    reportDataStatus: "incomplete",
    dataSource: "orithos_ledger",
    storeScope: "current_authenticated_store",
    writeRequests: [],
  };
  assert.equal(stockValueHonestyAcceptance(response).passed, true);
  assert.equal(stockValueHonestyAcceptance({
    ...response,
    answer: "Complete inventory value is AUD 402501.73.",
  }).passed, false);
  assert.equal(stockValueHonestyAcceptance({
    ...response,
    answer: "Known-cost on-hand inventory subtotal: AUD 402501.73 across 3080 products.",
  }).passed, false);
});

test("product count matches the authenticated active catalogue without requiring report metadata", () => {
  const response = {
    intent: "product_count",
    cards: [{ type: "product_count", count: 10854 }],
    writeRequests: [],
  };
  const result = productCountAcceptance(response, { total: 10854, status: "ACTIVE" });
  assert.equal(result.checks.activeCatalogueScope, true);
  assert.equal(result.passed, true);
  assert.equal(productCountAcceptance(response, { total: 10855, status: "ACTIVE" }).passed, false);
  assert.equal(productCountAcceptance(response, { total: 10854, status: "ALL" }).passed, false);
});

test("single-product stock answer matches the current quantity with provenance and freshness", () => {
  const result = singleProductStockAcceptance({
    intent: "report_stock",
    answer: "Sample Shiraz: -13 (inventory updated: 2026-11-20T04:15:00Z)",
    dataSource: "orithos_ledger",
    storeScope: "current_authenticated_store",
    report_data_as_of: "2026-11-20T04:15:00Z",
    writeRequests: [],
  }, { name: "Sample Shiraz", quantity: -13 });

  assert.equal(result.passed, true);
  assert.equal(result.answerQuantity, -13);
});

test("single-product stock answer rejects quantity, scope, and write mismatches", () => {
  const result = singleProductStockAcceptance({
    intent: "report_stock",
    answer: "Sample Shiraz: 0 (inventory update time unknown; verify before relying on it)",
    dataSource: "orithos_ledger",
    storeScope: "another_store",
    writeRequests: ["POST /api/sales"],
  }, { name: "Sample Shiraz", quantity: -13 });

  assert.equal(result.checks.quantityMatches, false);
  assert.equal(result.checks.storeScope, false);
  assert.equal(result.checks.noWrites, false);
  assert.equal(result.passed, false);
});

test("single-product stock answer accepts Chinese quantity and unknown-freshness disclosure", () => {
  const result = singleProductStockAcceptance({
    intent: "report_stock",
    answer: "样品西拉库存：0（库存更新时间未知，请核实）",
    dataSource: "orithos_ledger",
    storeScope: "current_authenticated_store",
    writeRequests: [],
  }, { name: "样品西拉", quantity: 0 });

  assert.equal(result.passed, true);
  assert.equal(result.answerQuantity, 0);
  assert.equal(result.dataAsOfPresent, false);
});
