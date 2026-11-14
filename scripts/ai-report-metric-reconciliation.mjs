function closeMoney(left, right) {
  return left !== null && left !== undefined && right !== null && right !== undefined
    && String(left).trim() !== "" && String(right).trim() !== ""
    && Number.isFinite(Number(left)) && Number.isFinite(Number(right))
    && Math.abs(Number(left) - Number(right)) < 0.005;
}

export function reconcileAiReportMetrics(answer, overview) {
  if (!answer || !overview) return false;

  const salesMatch = closeMoney(answer.sales, overview.revenue);
  const transactionsMatch = answer.transactions !== null && answer.transactions !== undefined
    && overview.transactions !== null && overview.transactions !== undefined
    && Number(answer.transactions) === Number(overview.transactions);
  const grossProfitUnavailable = answer.grossProfit == null
    && overview.grossProfit == null
    && answer.costAvailable === false
    && String(answer.reportDataStatus ?? "").toLowerCase() === "incomplete";
  const grossProfitMatch = closeMoney(answer.grossProfit, overview.grossProfit) || grossProfitUnavailable;

  return salesMatch && transactionsMatch && grossProfitMatch;
}
