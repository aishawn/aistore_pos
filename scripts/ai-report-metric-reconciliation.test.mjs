import assert from "node:assert/strict";
import test from "node:test";
import { reconcileAiReportMetrics } from "./ai-report-metric-reconciliation.mjs";

const overview = { revenue: 100.25, grossProfit: 42.1, transactions: 3 };

test("reconciles complete report metrics to the authoritative overview", () => {
  assert.equal(reconcileAiReportMetrics({
    sales: "100.25", grossProfit: "42.10", transactions: 3, costAvailable: true,
  }, overview), true);
});

test("accepts unavailable gross profit only when costs are incomplete in both results", () => {
  assert.equal(reconcileAiReportMetrics({
    sales: 100.25, grossProfit: null, transactions: 3,
    costAvailable: false, reportDataStatus: "incomplete",
  }, { ...overview, grossProfit: null }), true);
});

test("rejects fabricated profit when authoritative costs are unavailable", () => {
  assert.equal(reconcileAiReportMetrics({
    sales: 100.25, grossProfit: 42.1, transactions: 3,
    costAvailable: false, reportDataStatus: "incomplete",
  }, { ...overview, grossProfit: null }), false);
});

test("rejects metric differences even when gross profit is correctly unavailable", () => {
  assert.equal(reconcileAiReportMetrics({
    sales: 100.26, grossProfit: null, transactions: 4,
    costAvailable: false, reportDataStatus: "incomplete",
  }, { ...overview, grossProfit: null }), false);
});
