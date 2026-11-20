import assert from "node:assert/strict";
import test from "node:test";
import { aggregateSalesAcceptance, averageTicketAcceptance } from "./workflow-report-assertions.mjs";

const period = { from: "2026-11-01", to: "2026-11-21" };

test("aggregate sales reconciles Chinese revenue and requires cost gap disclosure", () => {
  const answer = "2026-11-01 to 2026-11-21营业额 AUD 3,965.54；毛利暂不可用，销售成本数据不完整。";
  const report = { revenue: 3965.54, transactions: 3152, costAvailable: false };
  assert.equal(aggregateSalesAcceptance(answer, report, period).passed, true);
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
