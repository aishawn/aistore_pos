import assert from "node:assert/strict";
import test from "node:test";
import { aggregateSalesAcceptance, averageTicketAcceptance, refundBreakdownAcceptance } from "./workflow-report-assertions.mjs";

const period = { from: "2026-11-01", to: "2026-11-21" };

test("aggregate sales reconciles Chinese revenue and requires cost gap disclosure", () => {
  const answer = "2026-11-01 to 2026-11-21营业额 AUD 3,965.54；毛利暂不可用，销售成本数据不完整。";
  const report = { revenue: 3965.54, transactions: 3152, costAvailable: false };
  assert.equal(aggregateSalesAcceptance(answer, report, period).passed, true);
  assert.equal(aggregateSalesAcceptance(
    "2026-11-01 至 2026-11-21营业额 AUD 3,965.54；毛利暂不可用，销售成本数据不完整。",
    report, period,
  ).passed, true);
  assert.equal(aggregateSalesAcceptance("营业额 AUD 3,965.54", report, period).passed, false);
  assert.equal(aggregateSalesAcceptance("营业额 AUD 3,965.54；毛利暂不可用", { ...report, revenue: 3965.55 }, period).passed, false);
});

test("aggregate sales accepts exact English revenue when costs are complete", () => {
  const answer = "Sales for 2026-11-01 to 2026-11-21 were AUD 3,965.54 and gross profit was AUD 1,013.36.";
  assert.equal(aggregateSalesAcceptance(answer, {
    revenue: 3965.54, transactions: 3152, costAvailable: true,
  }, period).passed, true);
});

test("average ticket reconciles amount and transaction count in English and Chinese", () => {
  const report = { averageSale: 28.47, transactions: 778 };
  assert.equal(averageTicketAcceptance(
    "Average Ticket for 2026-11-16 to 2026-11-21 is AUD 28.47 across 778 sales transactions.",
    report, { from: "2026-11-16", to: "2026-11-21" },
  ).passed, true);
  assert.equal(averageTicketAcceptance(
    "2026-11-16 to 2026-11-21平均客单价 AUD 28.47，基于 778 笔销售交易。",
    report, { from: "2026-11-16", to: "2026-11-21" },
  ).passed, true);
  assert.equal(averageTicketAcceptance(
    "2026-11-16 至 2026-11-21平均客单价 AUD 28.47，基于 778 笔销售交易。",
    report, { from: "2026-11-16", to: "2026-11-21" },
  ).passed, true);
  assert.equal(averageTicketAcceptance(
    "Average Ticket for 2026-11-16 to 2026-11-21 is AUD 28.47 across 779 sales transactions.",
    report, { from: "2026-11-16", to: "2026-11-21" },
  ).passed, false);
});

test("empty sales periods require an explicit no completed sales answer", () => {
  const report = { revenue: 0, transactions: 0, averageSale: null, costAvailable: false };
  assert.equal(aggregateSalesAcceptance("没有已完成销售记录。", report, period).passed, true);
  assert.equal(averageTicketAcceptance("No completed sales found for the period.", report, period).passed, true);
  assert.equal(averageTicketAcceptance("AUD 0.00", report, period).passed, false);
});

test("missing authoritative metrics never reconcile as zero", () => {
  assert.equal(aggregateSalesAcceptance("2026-11-01 to 2026-11-21营业额 AUD 0.00", {
    revenue: null, transactions: 3, costAvailable: true,
  }, period).passed, false);
  assert.equal(averageTicketAcceptance("Average Ticket for 2026-11-01 to 2026-11-21 is AUD 0.00 across 3 sales transactions.", {
    averageSale: null, transactions: 3,
  }, period).passed, false);
});

test("refund reporting reconciles gross sales, refunds and net revenue", () => {
  const report = {
    grossSales: 5294.14, refunds: 9.48, refundTransactions: 2,
    revenue: 5284.66, transactions: 168, costAvailable: false,
  };
  const answer = "Sales for 2026-11-14 were AUD 5284.66 after AUD 9.48 in refunds across 2 refund transactions (gross sales AUD 5294.14); gross profit is unavailable.";
  assert.equal(refundBreakdownAcceptance(answer, report).passed, true);
  assert.equal(refundBreakdownAcceptance(
    "2026-11-14营业额 AUD 5284.66（退款 AUD 9.48，共 2 笔，退款前销售额 AUD 5294.14）；毛利暂不可用。",
    report,
  ).passed, true);
  assert.equal(refundBreakdownAcceptance(answer.replace("2 refund transactions", "1 refund transaction"), report).passed, false);
  assert.equal(refundBreakdownAcceptance(answer, { ...report, revenue: 5284.65 }).passed, false);
  assert.equal(refundBreakdownAcceptance("营业额 AUD 5284.66", report).passed, false);
});

test("single-day sales answers reconcile without a repeated date range", () => {
  const report = { revenue: 5294.14, transactions: 168, costAvailable: true };
  assert.equal(aggregateSalesAcceptance(
    "Sales for 2026-11-14 were AUD 5294.14 and gross profit was AUD 1208.10.",
    report, { from: "2026-11-14", to: "2026-11-14" },
  ).passed, true);
});

test("single-day average ticket answers reconcile in English and Chinese", () => {
  const report = { averageSale: 26.24, transactions: 154 };
  const day = { from: "2026-11-23", to: "2026-11-23" };
  assert.equal(averageTicketAcceptance(
    "2026-11-23平均客单价 AUD 26.24，基于 154 笔销售交易。", report, day,
  ).passed, true);
  assert.equal(averageTicketAcceptance(
    "Average Ticket for 2026-11-23 is AUD 26.24 across 154 sales transactions.", report, day,
  ).passed, true);
  assert.equal(averageTicketAcceptance(
    "2026-11-23平均客单价 AUD 20.00，基于 154 笔销售交易。", report, day,
  ).passed, false);
});

test("refund-only days require the refund amount and negative net sales", () => {
  const report = {
    grossSales: 0, refunds: 9.48, refundTransactions: 1,
    revenue: -9.48, transactions: 0, costAvailable: true,
  };
  assert.equal(aggregateSalesAcceptance(
    "No completed sale transactions were recorded for 2026-11-14; AUD 9.48 in refunds across 1 refund transaction resulted in net sales of AUD -9.48.",
    report, { from: "2026-11-14", to: "2026-11-14" },
  ).passed, true);
});
