export type SalesAmountReconciliation = {
  orderGrossAmount: number;
  groupedAmount: number;
  difference: number;
  reconcilesToCent: boolean;
};

function cents(value: number) {
  if (!Number.isFinite(value)) throw new Error("Sales totals must be finite numbers.");
  return Math.round((value + Math.sign(value) * Number.EPSILON) * 100);
}

export function reconcileSalesAmounts(orderGrossAmount: number, groupedAmount: number): SalesAmountReconciliation {
  const orderCents = cents(orderGrossAmount);
  const groupedCents = cents(groupedAmount);
  const differenceCents = groupedCents - orderCents;
  return {
    orderGrossAmount: orderCents / 100,
    groupedAmount: groupedCents / 100,
    difference: differenceCents / 100,
    reconcilesToCent: differenceCents === 0,
  };
}
