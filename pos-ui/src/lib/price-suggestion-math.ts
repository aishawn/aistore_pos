export type SuggestionTax = {
  id: number;
  amount: number;
  amount_type: string;
  price_include: boolean;
  include_base_amount: boolean;
};

/** Only invert simple percentage taxes. Complex tax rules require an Odoo review. */
export function suggestedListPrice(cost: number, margin: number, taxes: SuggestionTax[]): number | null {
  if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(margin) || margin <= 0 || margin >= 1 || !taxes.length) return null;
  if (taxes.some((tax) => tax.amount_type !== "percent" || !Number.isFinite(tax.amount) || tax.amount < 0
    || typeof tax.price_include !== "boolean" || tax.include_base_amount !== false
    || tax.price_include !== taxes[0].price_include)) return null;
  const rate = taxes.reduce((sum, tax) => sum + tax.amount / 100, 0);
  const net = cost / (1 - margin);
  // Round upwards so a shelf rounding choice cannot undercut the target margin.
  // Cash-payment rounding is separate and remains controlled by Odoo at checkout.
  const stored = taxes[0].price_include ? net * (1 + rate) : net;
  const step = taxes[0].price_include ? 0.05 : 0.01;
  return Math.round(Math.ceil(stored / step - 1e-9) * step * 100) / 100;
}

export function netMargin(netPrice: number, cost: number): number | null {
  return Number.isFinite(netPrice) && netPrice > 0 && Number.isFinite(cost) && cost > 0
    ? (netPrice - cost) / netPrice : null;
}
