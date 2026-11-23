function answerMoney(answer, labels) {
  const alternatives = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = String(answer ?? "").match(new RegExp(`(?:${alternatives})\\s*(?:of\\s*)?(?:AUD\\s*)\\$?(-?[\\d,]+\\.\\d{2})`, "i"));
  return match ? Number(match[1].replaceAll(",", "")) : null;
}

const equalMoney = (left, right) => left != null && left !== ""
  && right != null && right !== ""
  && Number.isFinite(Number(left))
  && Number.isFinite(Number(right))
  && Math.abs(Number(left) - Number(right)) < 0.005;

export function aggregateSalesAcceptance(answer, report, { from, to }) {
  const hasRefunds = Number(report?.refundTransactions) > 0 || Number(report?.refunds) > 0;
  const noSales = Number(report?.transactions) === 0 && !hasRefunds;
  const labels = [
    `Sales for ${from} to ${to} were`,
    ...(from === to ? [`Sales for ${from} were`] : []),
    `${from} to ${to}营业额`,
    `${from} 至 ${to}营业额`,
    ...(from === to ? [`${from}营业额`] : []),
    "net sales of",
    "净营业额",
    "净营业额",
  ];
  const answeredRevenue = answerMoney(answer, labels);
  const noSalesDisclosed = /no completed sales|没有已完成销售记录/i.test(String(answer ?? ""));
  const revenueMatches = noSales
    ? noSalesDisclosed
    : equalMoney(answeredRevenue, report?.revenue);
  const costsAvailable = report?.costAvailable === true;
  const unavailableProfitDisclosed = /gross profit is unavailable|毛利暂不可用/i.test(String(answer ?? ""));
  const refundCheck = refundBreakdownAcceptance(answer, report);
  return {
    passed: revenueMatches && refundCheck.passed && (noSales || costsAvailable || unavailableProfitDisclosed),
    evidence: {
      expectedRevenue: Number.isFinite(Number(report?.revenue)) ? Number(report.revenue) : null,
      answeredRevenue,
      transactions: Number.isFinite(Number(report?.transactions)) ? Number(report.transactions) : null,
      revenueMatches,
      costsAvailable: report?.costAvailable ?? null,
      unavailableProfitDisclosed: noSales || costsAvailable || unavailableProfitDisclosed,
      refundCheck: refundCheck.evidence,
    },
  };
}

export function refundBreakdownAcceptance(answer, report) {
  const refunds = Number(report?.refunds);
  const refundTransactions = Number(report?.refundTransactions);
  const grossSales = Number(report?.grossSales);
  const revenue = Number(report?.revenue);
  const hasRefunds = Number.isFinite(refunds) && refunds > 0;
  const equationMatches = [grossSales, refunds, revenue].every(Number.isFinite)
    && Math.abs(grossSales - refunds - revenue) < 0.005;
  const answerText = String(answer ?? "");
  const answeredRefund = answerMoney(answerText, ["refunds", "退款"])
    ?? Number(answerText.match(/AUD\s*\$?([\d,]+\.\d{2})\s+in refunds/i)?.[1]?.replaceAll(",", "") ?? NaN);
  const answeredGrossSales = answerMoney(answerText, ["gross sales", "退款前销售额"]);
  const countMatch = answerText.match(/(?:across\s+|共\s*)([\d,]+(?:\.\d+)?)\s*(?:refund transactions?|笔)/i);
  const answeredRefundTransactions = countMatch ? Number(countMatch[1].replaceAll(",", "")) : null;
  const grossSalesMatches = grossSales <= 0 || equalMoney(answeredGrossSales, grossSales);
  const disclosureMatches = !hasRefunds || (equalMoney(answeredRefund, refunds)
    && answeredRefundTransactions === refundTransactions
    && grossSalesMatches);
  return {
    passed: !hasRefunds || (equationMatches && disclosureMatches),
    evidence: {
      expectedGrossSales: Number.isFinite(grossSales) ? grossSales : null,
      expectedRefunds: Number.isFinite(refunds) ? refunds : null,
      expectedRefundTransactions: Number.isFinite(refundTransactions) ? refundTransactions : null,
      expectedRevenue: Number.isFinite(revenue) ? revenue : null,
      equationMatches: !hasRefunds || equationMatches,
      answeredGrossSales,
      answeredRefund,
      answeredRefundTransactions,
      grossSalesMatches,
      disclosureMatches,
    },
  };
}

export function averageTicketAcceptance(answer, report, { from, to }) {
  const noSales = Number(report?.transactions) === 0;
  const labels = [
    `Average Ticket for ${from} to ${to} is`,
    `${from} to ${to}平均客单价`,
    `${from} 至 ${to}平均客单价`,
    ...(from === to ? [`Average Ticket for ${from} is`, `${from}平均客单价`] : []),
  ];
  const answeredAverage = answerMoney(answer, labels);
  const ticketMatch = String(answer ?? "").match(/(?:across\s+|基于\s*)([\d,]+(?:\.\d+)?)\s*(?:sales? transactions?|笔销售交易)/i);
  const answeredTransactions = ticketMatch ? Number(ticketMatch[1].replaceAll(",", "")) : null;
  const noSalesDisclosed = /no completed sales|没有已完成销售记录/i.test(String(answer ?? ""));
  const averageMatches = noSales
    ? noSalesDisclosed
    : equalMoney(answeredAverage, report?.averageSale)
      && answeredTransactions === Number(report?.transactions);
  return {
    passed: averageMatches,
    evidence: {
      expectedAverageSale: Number.isFinite(Number(report?.averageSale)) ? Number(report.averageSale) : null,
      answeredAverageSale: answeredAverage,
      expectedTransactions: Number.isFinite(Number(report?.transactions)) ? Number(report.transactions) : null,
      answeredTransactions,
      averageMatches,
    },
  };
}
