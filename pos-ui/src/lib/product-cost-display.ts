const numberFormat = new Intl.NumberFormat("en-AU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

function money(value: number): string {
  return `A$ ${numberFormat.format(value)}`;
}

export function productCostDisplay(
  cost: number | null | undefined,
  caseQuantity: number | null | undefined,
  status?: string | null,
): { caseCost: string; itemCost: string | null } | null {
  if (status?.trim().toUpperCase() === "NOT_ACTIVE") {
    return {
      caseCost: "Unavailable",
      itemCost: "Not in current Shopfront catalogue",
    };
  }
  if (cost == null || !Number.isFinite(cost)) return null;
  const itemCost = caseQuantity != null && Number.isFinite(caseQuantity) && caseQuantity > 0
    ? `${money(cost / caseQuantity)} / item`
    : null;

  return {
    caseCost: `${money(cost)} / case`,
    itemCost,
  };
}
