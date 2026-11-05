export type SourceReconciliation = "matched" | "mismatch" | "unavailable" | "not_comparable";

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function reconcileSourceGrossTotals(input: {
  sourceGross: unknown;
  sourceTax: unknown;
  odooPositiveGross: unknown;
  odooPositiveTax: unknown;
  comparisonBasis: "same_ledger" | "distinct_ledgers";
}): SourceReconciliation {
  if (input.comparisonBasis === "distinct_ledgers") return "not_comparable";
  const { sourceGross, sourceTax, odooPositiveGross, odooPositiveTax } = input;
  if (!finite(sourceGross) || !finite(sourceTax) || !finite(odooPositiveGross) || !finite(odooPositiveTax)) return "unavailable";
  return Math.abs(sourceGross - odooPositiveGross) < 0.011 && Math.abs(sourceTax - odooPositiveTax) < 0.011
    ? "matched"
    : "mismatch";
}
