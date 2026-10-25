import { createHash } from "node:crypto";
import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";

export type PricingLine = { productId: number; quantity: number; uomFactor?: number };
export type ResolvedPrices = { prices: { productId: number; unitPrice: number }[]; pricelistId: number | false; priceSource: string; priceSourceName: string; currency: string };

export function aggregateQuantities(lines: PricingLine[]) {
  const quantities = new Map<number, number>();
  for (const line of lines) quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity * (line.uomFactor ?? 1));
  return [...quantities].map(([productId, quantity]) => ({ productId, quantity }));
}

export async function resolveCartPrices(scope: Awaited<ReturnType<typeof scopedOdoo>>, configId: number, partnerId: number | null | undefined, lines: PricingLine[]) {
  let result: ResolvedPrices;
  try {
    result = await scope.rpc<ResolvedPrices>("pos.config", "orithos_quote_prices", [[configId], aggregateQuantities(lines), partnerId || false]);
  } catch (error) {
    if (error instanceof OdooScopeError && [401, 403, 502, 503].includes(error.status)) throw error;
    throw new OdooScopeError("Odoo pricing is unavailable. Upgrade Orithos AU Retail and check the customer and register price lists, then retry.", 409);
  }
  if (!Array.isArray(result?.prices) || typeof result.currency !== "string" || typeof result.priceSourceName !== "string") throw new OdooScopeError("Odoo returned an invalid price quote.", 502);
  const expected = aggregateQuantities(lines);
  if (result.prices.length !== expected.length || expected.some((line) => result.prices.filter((price) => price.productId === line.productId && typeof price.unitPrice === "number" && Number.isFinite(price.unitPrice) && price.unitPrice >= 0).length !== 1)) throw new OdooScopeError("Odoo returned an incomplete price quote.", 502);
  return result;
}

export function priceSignature(input: { configId: number; paymentMethodId: number; customerId?: number | null; lines: PricingLine[]; prices: ResolvedPrices; totals: { subtotal: number; tax: number; total: number } }) {
  return createHash("sha256").update(JSON.stringify({
    configId: input.configId, paymentMethodId: input.paymentMethodId, customerId: input.customerId ?? null,
    lines: input.lines.map((line) => [line.productId, line.quantity, line.uomFactor ?? 1]),
    prices: input.prices.prices.map((price) => [price.productId, price.unitPrice]).sort((a, b) => a[0] - b[0]),
    pricelistId: input.prices.pricelistId, currency: input.prices.currency,
    totals: { subtotal: input.totals.subtotal, tax: input.totals.tax, total: input.totals.total },
  })).digest("hex");
}
