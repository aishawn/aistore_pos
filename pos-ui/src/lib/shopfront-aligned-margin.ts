/** Shopfront Profit % = (revenue - cost) / revenue on tax-inclusive revenue. */
export function shopfrontAlignedMarginRatio(
  grossProfit: number | null | undefined,
  revenue: number | null | undefined,
): number | null {
  if (grossProfit == null || revenue == null) return null;
  if (!Number.isFinite(grossProfit) || !Number.isFinite(revenue) || !(revenue > 0)) return null;
  return grossProfit / revenue;
}

/** Shopfront FORMAT((revenue - cost) / revenue * 100, '', '%', 2). */
export function formatShopfrontProfitPercent(marginRatio: number, digits = 2): string {
  return `${(marginRatio * 100).toFixed(digits)}%`;
}
