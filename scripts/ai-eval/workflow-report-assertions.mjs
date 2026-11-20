function answerMoney(answer, labels) {
  const alternatives = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = String(answer ?? "").match(new RegExp(`(?:${alternatives})\\s*(?:AUD\\s*)\\$?([\\d,]+\\.\\d{2})`, "i"));
  return match ? Number(match[1].replaceAll(",", "")) : null;
}

const equalMoney = (left, right) => Number.isFinite(Number(left))
  && Number.isFinite(Number(right))
  && Math.abs(Number(left) - Number(right)) < 0.005;

export function aggregateSalesAcceptance(answer, report, { from, to }) {
  const noSales = Number(report?.transactions) === 0;
  const labels = [
    `Sales for ${from} to ${to} were`,
    `${from} to ${to}营业额`,
  ];
  const answeredRevenue = answerMoney(answer, labels);
  const noSalesDisclosed = /no completed sales|没有已完成销售记录/i.test(String(answer ?? ""));
  const revenueMatches = noSales
    ? noSalesDisclosed
    : equalMoney(answeredRevenue, report?.revenue);
  const costsAvailable = report?.costAvailable === true;
  const unavailableProfitDisclosed = /gross profit is unavailable|毛利暂不可用/i.test(String(answer ?? ""));
  return {
    passed: revenueMatches && (noSales || costsAvailable || unavailableProfitDisclosed),
    evidence: {
      expectedRevenue: Number.isFinite(Number(report?.revenue)) ? Number(report.revenue) : null,
      answeredRevenue,
      transactions: Number.isFinite(Number(report?.transactions)) ? Number(report.transactions) : null,
      revenueMatches,
      costsAvailable: report?.costAvailable ?? null,
      unavailableProfitDisclosed: noSales || costsAvailable || unavailableProfitDisclosed,
    },
  };
}

export function averageTicketAcceptance(answer, report, { from, to }) {
  const noSales = Number(report?.transactions) === 0;
  const labels = [
    `Average Ticket for ${from} to ${to} is`,
    `${from} to ${to}平均客单价`,
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
