export type QuotedCartLine = { quantity: number; total: number };

export function resolveCartDisplayAmounts(
  quantity: number,
  baseUnitPrice: number,
  quoteLine?: QuotedCartLine,
  discountPercent = 0,
) {
  if (quoteLine && quoteLine.quantity === quantity && Number.isFinite(quoteLine.total)) {
    return {
      unitPrice: quantity > 0 ? quoteLine.total / quantity : baseUnitPrice,
      lineTotal: quoteLine.total,
    };
  }

  return {
    unitPrice: baseUnitPrice,
    lineTotal: Math.round(baseUnitPrice * quantity * (1 - discountPercent / 100) * 100) / 100,
  };
}

export function formatCartUnitPrice(amount: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}
