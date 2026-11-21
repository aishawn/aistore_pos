import type { RetailProductRecord } from "@/lib/retail-api";

export type WorkspaceTab = "keys" | "parked" | "more";
export type CatalogDensity = "grid" | "list";

export type CartLine = {
  product: RetailProductRecord;
  quantity: number;
  /** Units per pack (1 = bottle/each, 12 = case). */
  packFactor: number;
  /** Line discount as a percentage from 0 to 100. */
  discountPercent?: number;
  /** Explanation required by the company discount policy. */
  discountReason?: string;
};

export type ParkedSale = {
  id: string;
  ownerUserId: string;
  companyId: number;
  companyName: string;
  registerName: string;
  registerId?: number;
  sessionName: string;
  timezone?: string;
  paymentMethodId: number | null;
  customer: { id: number; name: string } | null;
  note?: string | null;
  lines: CartLine[];
  createdAt: string;
};

export function prepareParkedSaleNote(value: string, required: boolean): { valid: boolean; note: string | null } {
  const note = value.trim();
  return { valid: !required || note.length > 0, note: note || null };
}

export const CASE_PACK_OPTIONS = [1, 6, 12, 24] as const;

export const CATEGORY_TILE_TONES = [
  { bg: "var(--oh-tile-orange-bg)", border: "var(--oh-tile-orange-border)", text: "var(--oh-tile-orange-text)" },
  { bg: "var(--oh-tile-red-bg)", border: "var(--oh-tile-red-border)", text: "var(--oh-tile-red-text)" },
  { bg: "var(--oh-tile-blue-bg)", border: "var(--oh-tile-blue-border)", text: "var(--oh-tile-blue-text)" },
  { bg: "var(--oh-tile-green-bg)", border: "var(--oh-tile-green-border)", text: "var(--oh-tile-green-text)" },
] as const;

export function shelfUnitPrice(product: RetailProductRecord): number | null {
  return product.price_included;
}

export function provisionalLineUnit(product: RetailProductRecord, packFactor: number): number {
  const unit = shelfUnitPrice(product);
  return (unit ?? product.list_price) * packFactor;
}

export function formatStockQty(qty: number) {
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(qty);
}

export const money = (amount: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);

export const SALE_KEY_TILE_CLASS =
  "flex min-h-[4.5rem] cursor-pointer flex-col items-center justify-center rounded-[var(--oh-radius)] border px-2 py-3 text-center text-[14px] font-semibold shadow-[var(--oh-shadow-card)] transition-all hover:opacity-95 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-orange)]";
