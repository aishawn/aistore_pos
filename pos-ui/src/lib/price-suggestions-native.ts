import { api, ApiError, type Page } from "@/lib/api";

export type SuggestionStatus = "ok" | "raise" | "review_cost" | "review_tax" | "missing_cost" | "unsaleable";

export type PriceSuggestionProduct = {
  id: number;
  name: string;
  sku: string;
  unit: string;
  soldUnits: number;
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
  price?: number | null;
  cost?: number | null;
  stockQuantity?: number | null;
  barcodes?: Array<{ code?: string | null }> | null;
};

const PAGE_SIZE = 40;

function gstNet(inclusive: number) {
  return inclusive / 1.1;
}

function gstComponent(inclusive: number) {
  return inclusive - gstNet(inclusive);
}

function inclusiveFromNet(net: number) {
  return net * 1.1;
}

function sku(row: ProductRow) {
  return row.barcodes?.find((barcode) => barcode.code)?.code || "";
}

function buildSuggestion(product: ProductRow, marginTarget: number): PriceSuggestionProduct {
  const cost = product.cost == null ? null : Number(product.cost);
  const shelf = product.price == null ? null : Number(product.price);
  const onHand = product.stockQuantity == null ? 0 : Number(product.stockQuantity);
  const base: PriceSuggestionProduct = {
    id: Number(product.id),
    name: product.name,
    sku: sku(product),
    unit: "units",
    soldUnits: 0,
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
  if (cost == null || cost <= 0) {
    return { ...base, status: "missing_cost", reason: "Standard cost is missing in Orithos. No price suggestion is shown." };
  }
  const currentNet = gstNet(shelf);
  const currentMargin = (currentNet - cost) / currentNet;
  const suggestedNet = cost / (1 - marginTarget);
  const suggestedShelf = inclusiveFromNet(suggestedNet);
  const suggestedMargin = (suggestedNet - cost) / suggestedNet;
  const status: SuggestionStatus = currentMargin + 0.005 < marginTarget ? "raise" : "ok";
  return {
    ...base,
    currentMargin,
    suggestedPrice: status === "raise" ? suggestedShelf : null,
    suggestedMargin: status === "raise" ? suggestedMargin : currentMargin,
    suggestedListPrice: status === "raise" ? suggestedShelf : null,
    currentNetPrice: currentNet,
    currentGst: gstComponent(shelf),
    suggestedNetPrice: status === "raise" ? suggestedNet : currentNet,
    suggestedGst: status === "raise" ? gstComponent(suggestedShelf) : gstComponent(shelf),
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
    const [me, products] = await Promise.all([
      api.get<{ name?: string }>("/api/auth/me"),
      api.get<Page<ProductRow>>("/api/products", { page, size: PAGE_SIZE, status: "ACTIVE" }),
    ]);
    const items = products.items.map((product) => buildSuggestion(product, marginTarget));
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
