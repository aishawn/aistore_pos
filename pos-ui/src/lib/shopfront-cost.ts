export function shopfrontCostValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
