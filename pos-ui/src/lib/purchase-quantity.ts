function displayNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

export function formatPurchaseQuantity(quantity?: number | null, caseQuantity?: number | null): string {
  if (quantity == null || !Number.isFinite(Number(quantity))) return "—";
  const value = Number(quantity);
  const pack = Number(caseQuantity);
  if (!Number.isFinite(pack) || pack <= 0) return `${displayNumber(value)} items`;

  const cases = Math.floor((value + 1e-8) / pack);
  const items = Number((value - cases * pack).toFixed(4));
  const caseLabel = cases === 1 ? "case" : "cases";
  if (cases <= 0) return `${displayNumber(value)} items`;
  if (items === 0) return `${cases} ${caseLabel}`;
  return `${cases} ${caseLabel} + ${displayNumber(items)} items`;
}

export function positivePurchaseLines<T extends { quantity: number }>(lines: readonly T[]): T[] {
  return lines.filter((line) => Number.isFinite(line.quantity) && line.quantity > 0);
}

export function estimatePurchaseValue(lines: readonly { quantity: number; unitCost?: number | null }[]): {
  subtotal: number; missingCosts: number;
} {
  let subtotal = 0;
  let missingCosts = 0;
  for (const line of positivePurchaseLines(lines)) {
    if (line.unitCost == null || !Number.isFinite(line.unitCost) || line.unitCost <= 0) {
      missingCosts += 1;
      continue;
    }
    subtotal += line.quantity * line.unitCost;
  }
  return { subtotal, missingCosts };
}
