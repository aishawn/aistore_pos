import { createHash } from "node:crypto";
import { scopedOdoo, OdooScopeError } from "@/lib/odoo-scope";

export type PricingLine = { productId: number; quantity: number; uomFactor?: number; discountPercent?: number };
export type ResolvedPrices = { prices: { productId: number; unitPrice: number }[]; pricelistId: number | false; priceSource: string; priceSourceName: string; currency: string };

export function aggregateQuantities(lines: PricingLine[]) {
  const quantities = new Map<number, number>();
  for (const line of lines) quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity * (line.uomFactor ?? 1));
  return [...quantities].map(([productId, quantity]) => ({ productId, quantity }));
}

function bridgeMethodMissing(error: unknown) {
  return error instanceof OdooScopeError
    && /orithos_quote_prices/i.test(error.message)
    && /does not exist/i.test(error.message);
}

async function resolveCartPricesFromRegister(
  scope: Awaited<ReturnType<typeof scopedOdoo>>,
  configId: number,
  partnerId: number | null | undefined,
  lines: PricingLine[],
): Promise<ResolvedPrices> {
  type PosConfigRow = { pricelist_id: [number, string] | false; currency_id: [number, string] };
  const configs = await scope.rpc<PosConfigRow[]>("pos.config", "search_read", [[["id", "=", configId]]], {
    fields: ["pricelist_id", "currency_id"],
    limit: 1,
  });
  const config = configs?.[0];
  if (!config) throw new OdooScopeError("This register is not available to your Orithos user.", 403);

  let pricelistId: number | false = Array.isArray(config.pricelist_id) ? config.pricelist_id[0] : false;
  let priceSourceName = Array.isArray(config.pricelist_id) ? config.pricelist_id[1] : "Standard price";
  let priceSource = "register";

  if (partnerId != null && partnerId > 0) {
    type PartnerRow = { property_product_pricelist: [number, string] | false };
    const partners = await scope.rpc<PartnerRow[]>("res.partner", "search_read", [[["id", "=", partnerId]]], {
      fields: ["property_product_pricelist"],
      limit: 1,
    });
    const customerList = partners?.[0]?.property_product_pricelist;
    if (Array.isArray(customerList)) {
      pricelistId = customerList[0];
      priceSourceName = customerList[1];
      priceSource = "customer";
    }
  }

  const productIds = [...new Set(lines.map((line) => line.productId))];
  type ProductRow = { id: number; lst_price: number };
  const products = await scope.rpc<ProductRow[]>("product.product", "search_read", [[["id", "in", productIds], ["available_in_pos", "=", true]]], {
    fields: ["id", "lst_price"],
    limit: productIds.length,
  });
  const priceById = new Map((products ?? []).map((product) => [product.id, product.lst_price]));
  const aggregated = aggregateQuantities(lines);
  const prices = aggregated.map(({ productId }) => {
    const unitPrice = priceById.get(productId);
    if (typeof unitPrice !== "number" || !Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new OdooScopeError("One or more products are no longer available in this POS.", 409);
    }
    return { productId, unitPrice };
  });

  const currency = Array.isArray(config.currency_id) ? config.currency_id[1] : "AUD";
  return {
    prices,
    pricelistId,
    priceSource,
    priceSourceName,
    currency,
  };
}

export async function resolveCartPrices(scope: Awaited<ReturnType<typeof scopedOdoo>>, configId: number, partnerId: number | null | undefined, lines: PricingLine[]) {
  let result: ResolvedPrices;
  try {
    result = await scope.rpc<ResolvedPrices>("pos.config", "orithos_quote_prices", [[configId], aggregateQuantities(lines), partnerId || false]);
  } catch (error) {
    if (error instanceof OdooScopeError && [401, 403, 502, 503].includes(error.status)) throw error;
    if (bridgeMethodMissing(error)) {
      result = await resolveCartPricesFromRegister(scope, configId, partnerId, lines);
    } else {
      throw new OdooScopeError("Odoo pricing is unavailable. Upgrade Orithos AU Retail and check the customer and register price lists, then retry.", 409);
    }
  }
  if (!Array.isArray(result?.prices) || typeof result.currency !== "string" || typeof result.priceSourceName !== "string") throw new OdooScopeError("Odoo returned an invalid price quote.", 502);
  const expected = aggregateQuantities(lines);
  if (result.prices.length !== expected.length || expected.some((line) => result.prices.filter((price) => price.productId === line.productId && typeof price.unitPrice === "number" && Number.isFinite(price.unitPrice) && price.unitPrice >= 0).length !== 1)) throw new OdooScopeError("Odoo returned an incomplete price quote.", 502);
  return result;
}

export function priceSignature(input: { configId: number; paymentMethodId: number; customerId?: number | null; lines: PricingLine[]; prices: ResolvedPrices; totals: { subtotal: number; tax: number; total: number } }) {
  return createHash("sha256").update(JSON.stringify({
    configId: input.configId, paymentMethodId: input.paymentMethodId, customerId: input.customerId ?? null,
    lines: input.lines.map((line) => [line.productId, line.quantity, line.uomFactor ?? 1, line.discountPercent ?? 0]),
    prices: input.prices.prices.map((price) => [price.productId, price.unitPrice]).sort((a, b) => a[0] - b[0]),
    pricelistId: input.prices.pricelistId, currency: input.prices.currency,
    totals: { subtotal: input.totals.subtotal, tax: input.totals.tax, total: input.totals.total },
  })).digest("hex");
}
