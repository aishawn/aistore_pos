import type { OdooProductRecord } from "./odoo-api";

export type NativeProductRow = {
  id: number;
  name: string;
  status?: string | null;
  type?: string | null;
  categoryId?: number | null;
  categoryName?: string | null;
  brandId?: number | null;
  brandName?: string | null;
  familyId?: number | null;
  price?: number | null;
  cost?: number | null;
  caseCost?: number | null;
  costPercentage?: boolean | null;
  caseQuantity?: number | null;
  shopfrontCatalogConfirmed?: boolean | null;
  shopfrontSourceUpdatedAt?: string | null;
  stockQuantity?: number | null;
  trackInventory?: boolean | null;
  barcodes?: Array<{ code?: string | null }> | null;
  performance30d?: Array<number | string> | null;
};

export function mapNativeProduct(product: NativeProductRow): OdooProductRecord {
  const barcode = product.barcodes?.find((row) => row.code)?.code || false;
  const priceKnown = product.price != null && Number.isFinite(Number(product.price));
  const price = priceKnown ? Number(product.price) : 0;
  const cost = product.cost == null ? null : Number(product.cost);
  const sourceUpdatedAt = product.shopfrontSourceUpdatedAt?.trim() || null;
  const status = (product.status || "ACTIVE").toUpperCase();
  const currentCatalogProduct = status === "ACTIVE" || status === "NOT_PURCHASING";
  const sourceCostStatus = !currentCatalogProduct || product.shopfrontCatalogConfirmed !== true || !sourceUpdatedAt
    ? "unavailable"
    : product.costPercentage === true ? cost === null ? "missing" : "available"
      : product.caseCost == null || !Number.isFinite(Number(product.caseCost)) ? "missing" : "available";
  const qty = product.stockQuantity == null ? 0 : Number(product.stockQuantity);
  const categoryId = product.categoryId == null ? null : Number(product.categoryId);
  // Shopfront: NOT_PURCHASING remains sellable; NOT_SELLING / NOT_ACTIVE do not.
  const sellable = status === "ACTIVE" || status === "NOT_PURCHASING";
  const performance30d = product.performance30d?.map((point) => Number(point)).filter((point) => Number.isFinite(point)) ?? null;
  return {
    id: Number(product.id),
    name: product.name,
    display_name: product.name,
    active: sellable,
    barcode,
    default_code: false,
    list_price: price,
    standard_price: cost ?? false,
    shopfront_cost: sourceCostStatus === "available"
      ? product.costPercentage === true ? cost : Number(product.caseCost)
      : null,
    shopfront_cost_status: sourceCostStatus,
    shopfront_cost_percentage: product.costPercentage === true,
    shopfront_source_updated_at: sourceUpdatedAt,
    shopfront_case_quantity: product.caseQuantity == null ? null : Number(product.caseQuantity),
    shopfront_price: price,
    shopfront_quantity: qty,
    shopfront_inventory_status: product.stockQuantity == null ? "missing" : "available",
    shopfront_data_status: product.stockQuantity == null ? "missing" : "available",
    shopfront_source_name: product.name,
    shopfront_source_category: product.categoryName || false,
    shopfront_source_status: product.status || null,
    shopfront_track_inventory: product.trackInventory ?? true,
    performance_30d: performance30d,
    performance_source: performance30d ? "Odoo" : undefined,
    taxes_id: [],
    price_included: priceKnown ? price : null,
    price_tax: null,
    qty_available: qty,
    free_qty: qty,
    uom_id: false,
    pos_categ_ids: categoryId ? [categoryId] : [],
    available_in_pos: sellable,
  };
}
