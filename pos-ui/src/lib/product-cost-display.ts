const numberFormat = new Intl.NumberFormat("en-AU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const percentageFormat = new Intl.NumberFormat("en-AU", {
  maximumFractionDigits: 4,
});

function money(value: number): string {
  return `A$ ${numberFormat.format(value)}`;
}

export function productCostDisplay(
  cost: number | null | undefined,
  caseQuantity: number | null | undefined,
  status?: string | null,
  costPercentage = false,
  shopfrontCatalogConfirmed?: boolean | null,
): { caseCost: string; itemCost: string } {
  if (shopfrontCatalogConfirmed === false) {
    return {
      caseCost: "Unavailable",
      itemCost: "Not confirmed in current Shopfront catalogue",
    };
  }
  const normalizedStatus = status?.trim().toUpperCase();
  if (!normalizedStatus) {
    return {
      caseCost: "Unavailable",
      itemCost: "Shopfront status is unverified",
    };
  }
  if (normalizedStatus !== "ACTIVE") {
    return {
      caseCost: "Unavailable",
      itemCost: "Not current in Shopfront catalogue",
    };
  }
  if (cost == null || !Number.isFinite(cost)) {
    return {
      caseCost: "Unavailable",
      itemCost: "Shopfront cost is missing",
    };
  }
  if (costPercentage) {
    return {
      caseCost: `${percentageFormat.format(cost)}%`,
      itemCost: "Percentage cost; no currency amount",
    };
  }
  if (caseQuantity == null || !Number.isFinite(caseQuantity) || caseQuantity <= 0) {
    return {
      caseCost: `${money(cost)} / case`,
      itemCost: "Unavailable: invalid case quantity",
    };
  }

  return {
    caseCost: `${money(cost)} / case`,
    itemCost: `${money(cost / caseQuantity)} / item`,
  };
}
