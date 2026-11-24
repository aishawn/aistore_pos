import { api, ApiError, type Page } from "@/lib/api";
import { netMargin, simpleTaxTotals, suggestedListPrice, type SuggestionTax } from "@/lib/price-suggestion-math";

export type SuggestionStatus = "ok" | "raise" | "review_cost" | "review_tax" | "missing_cost" | "fixed_price" | "unsaleable";

export type PriceSuggestionProduct = {
  id: number;
  name: string;
  sku: string;
  unit: string;
  soldUnits: number | null;
  onHand: number;
  cost: number | null;
  currentPrice: number | null;
  currentMargin: number | null;
  suggestedPrice: number | null;
  suggestedMargin: number | null;
  status: SuggestionStatus;
  reason: string;
  currentNetPrice?: number | null;
  currentGst?: number | null;
  suggestedNetPrice?: number | null;
  suggestedGst?: number | null;
  currentListPrice?: number | null;
  suggestedListPrice?: number | null;
};

export type PriceSuggestionData = {
  company: string;
  historyDays: number;
  marginTarget: number;
  products: PriceSuggestionProduct[];
  truncated: boolean;
  generatedAt: string;
  writeEnabled: false;
  nextOffset?: number | null;
  offset?: number;
};

type ProductRow = {
  id: number;
  name: string;
  type?: string | null;
  categoryName?: string | null;
  price?: number | null;
  cost?: number | null;
  taxRateId?: number | null;
  stockQuantity?: number | null;
  performance30d?: Array<number | string | null> | null;
  barcodes?: Array<{ code?: string | null }> | null;
};

type TaxRateRow = { id: number; amount?: number | string | null };

const PAGE_SIZE = 40;

function sku(row: ProductRow) {
  return row.barcodes?.find((barcode) => barcode.code)?.code || "";
}

function cents(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function soldUnitsLast28Days(series?: ProductRow["performance30d"]) {
  if (!series || series.length < 28) return null;
  const recent = series.slice(-28).map((value) => value == null ? NaN : Number(value));
  if (recent.some((value) => !Number.isFinite(value))) return null;
  return cents(recent.reduce((sum, value) => sum + value, 0));
}

export function buildSuggestion(product: ProductRow, marginTarget: number, taxRates: TaxRateRow[]): PriceSuggestionProduct {
  const cost = product.cost == null ? null : Number(product.cost);
  const shelf = product.price == null ? null : Number(product.price);
  const onHand = product.stockQuantity == null ? 0 : Number(product.stockQuantity);
  const base: PriceSuggestionProduct = {
    id: Number(product.id),
    name: product.name,
    sku: sku(product),
    unit: "units",
    soldUnits: soldUnitsLast28Days(product.performance30d),
    onHand,
    cost,
    currentPrice: shelf,
    currentMargin: null,
    suggestedPrice: null,
    suggestedMargin: null,
    status: "ok",
    reason: "Shelf price is on target for the selected margin, or cost is not available for a suggestion.",
    currentListPrice: shelf,
    suggestedListPrice: null,
  };
  if (shelf == null || shelf <= 0) {
    return { ...base, status: "unsaleable", reason: "No GST-inclusive shelf price is configured in Orithos." };
  }
  if (product.type?.toUpperCase() === "INTEGRATED" || product.categoryName?.trim().toUpperCase() === "EPAY") {
    return {
      ...base,
      status: "fixed_price",
      reason: "This is a fixed-denomination or EPAY product. Confirm provider terms before changing its price; no margin-based price is suggested.",
    };
  }
  if (cost == null || cost <= 0) {
    return { ...base, status: "missing_cost", reason: "Standard cost is missing in Orithos. No price suggestion is shown." };
  }
  const rate = taxRates.find((item) => Number(item.id) === Number(product.taxRateId));
  const amount = rate?.amount == null ? NaN : Number(rate.amount);
  if (!rate || !Number.isFinite(amount) || amount < 0) {
    return { ...base, status: "review_tax", reason: "Product tax rate is missing or invalid in Orithos. Review tax before pricing." };
  }
  const tax: SuggestionTax = {
    id: Number(rate.id), amount, amount_type: "percent", price_include: true, include_base_amount: false,
  };
  const currentTotals = simpleTaxTotals(shelf, [tax]);
  const suggestedShelf = suggestedListPrice(cost, marginTarget, [tax]);
  if (!currentTotals || suggestedShelf == null) {
    return { ...base, status: "review_tax", reason: "Product tax configuration cannot be calculated safely. Review tax before pricing." };
  }
  const currentNet = currentTotals.total_excluded;
  const currentMargin = netMargin(currentNet, cost);
  if (currentMargin == null) {
    return { ...base, status: "review_cost", reason: "Net shelf price and standard cost cannot be compared safely. Review cost and tax." };
  }
  const suggestedTotals = simpleTaxTotals(suggestedShelf, [tax]);
  if (!suggestedTotals) {
    return { ...base, status: "review_tax", reason: "Suggested tax totals cannot be calculated safely. Review tax before pricing." };
  }
  const suggestedNet = suggestedTotals.total_excluded;
  const suggestedMargin = netMargin(suggestedNet, cost)!;
  const status: SuggestionStatus = currentMargin + 0.005 < marginTarget ? "raise" : "ok";
  return {
    ...base,
    currentMargin,
    suggestedPrice: status === "raise" ? suggestedShelf : null,
    suggestedMargin: status === "raise" ? suggestedMargin : currentMargin,
    suggestedListPrice: status === "raise" ? suggestedShelf : null,
    currentNetPrice: currentNet,
    currentGst: cents(shelf - currentNet),
    suggestedNetPrice: status === "raise" ? suggestedNet : currentNet,
    suggestedGst: status === "raise" ? cents(suggestedShelf - suggestedNet) : cents(shelf - currentNet),
    status,
    reason: status === "raise"
      ? `Net margin ${(currentMargin * 100).toFixed(1)}% is below the ${(marginTarget * 100).toFixed(0)}% target on cost ${cost.toFixed(2)} AUD.`
      : `Net margin ${(currentMargin * 100).toFixed(1)}% meets or exceeds the ${(marginTarget * 100).toFixed(0)}% target.`,
  };
}

export async function fetchPriceSuggestions(
  marginTarget: number,
  offset: number,
): Promise<PriceSuggestionData> {
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  try {
    const [me, products, taxRates] = await Promise.all([
      api.get<{ name?: string }>("/api/auth/me"),
      api.get<Page<ProductRow>>("/api/products", { page, size: PAGE_SIZE, status: "ACTIVE" }),
      api.get<TaxRateRow[]>("/api/tax-rates"),
    ]);
    const items = products.items.map((product) => buildSuggestion(product, marginTarget, taxRates));
    const nextOffset = page * PAGE_SIZE < products.total ? offset + PAGE_SIZE : null;
    return {
      company: me.name || "Store",
      historyDays: 28,
      marginTarget,
      products: items,
      truncated: page * PAGE_SIZE < products.total,
      generatedAt: new Date().toISOString(),
      writeEnabled: false,
      nextOffset,
      offset,
    };
  } catch (cause) {
    if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) {
      throw Object.assign(new Error(cause.message), { needsConnection: true });
    }
    throw cause;
  }
}
