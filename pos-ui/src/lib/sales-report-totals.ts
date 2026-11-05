function roundCents(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function summarizeSalesTotals(positiveOrderTotal: number, signedRefundOrderTotal: number) {
  const positiveSales = roundCents(positiveOrderTotal);
  const refunds = roundCents(Math.abs(signedRefundOrderTotal));
  return { positiveSales, refunds, netSales: roundCents(positiveSales - refunds) };
}
