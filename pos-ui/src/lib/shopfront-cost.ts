export function shopfrontCostValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function shopfrontCostDisplayState(
  status: "available" | "missing" | "unavailable" | "restricted",
  value: unknown,
): "available" | "missing" | "unavailable" | "restricted" {
  if (status !== "available") return status === "restricted" ? "restricted" : "unavailable";
  return shopfrontCostValue(value) === null ? "missing" : "available";
}

export function shopfrontCostPresentation(
  value: unknown,
  packSize: unknown,
  percentage = false,
): {
  sourceCost: number | null;
  caseQuantity: number | null;
  percentage: boolean;
  unitEstimate: number | null;
} {
  const sourceCost = shopfrontCostValue(value);
  const caseQuantity = typeof packSize === "number" && Number.isFinite(packSize) && packSize > 0
    ? packSize
    : null;

  return {
    sourceCost,
    caseQuantity,
    percentage,
    unitEstimate: !percentage && sourceCost !== null && caseQuantity !== null && caseQuantity > 1
      ? sourceCost / caseQuantity
      : null,
  };
}
