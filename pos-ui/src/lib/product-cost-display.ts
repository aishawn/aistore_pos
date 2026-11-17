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
  unitCost: number | null | undefined,
  caseQuantity: number | null | undefined,
  status?: string | null,
  costPercentage = false,
  shopfrontCatalogConfirmed?: boolean | null,
  exactCaseCost?: number | null,
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
  const validUnitCost = unitCost != null && Number.isFinite(unitCost) ? unitCost : null;
  const validCaseCost = exactCaseCost != null && Number.isFinite(exactCaseCost) ? exactCaseCost : null;
  if (shopfrontCatalogConfirmed === true && !costPercentage && validCaseCost == null) {
    return { caseCost: "Unavailable", itemCost: "Shopfront case cost is missing" };
  }
  if (validUnitCost == null && validCaseCost == null) {
    return {
      caseCost: "Unavailable",
      itemCost: "Shopfront cost is missing",
    };
  }
  if (costPercentage) {
    return {
      caseCost: `${percentageFormat.format(validUnitCost ?? validCaseCost!)}%`,
      itemCost: "Percentage cost; no currency amount",
    };
  }
  const validCaseQuantity = caseQuantity != null && Number.isFinite(caseQuantity) && caseQuantity > 0
    ? caseQuantity
    : null;
  const displayedCaseCost = validCaseCost ?? (validUnitCost != null && validCaseQuantity != null
    ? validUnitCost * validCaseQuantity
    : null);
  return {
    caseCost: displayedCaseCost == null ? "Unavailable" : `${money(displayedCaseCost)} / case`,
    itemCost: validUnitCost != null
      ? `${money(validUnitCost)} / item`
      : validCaseQuantity != null
        ? `${money(validCaseCost! / validCaseQuantity)} / item`
        : "Unavailable: invalid case quantity",
  };
}
