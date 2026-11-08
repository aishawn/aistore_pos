export interface ShopfrontSourceIdentity {
  source_id: string;
  source_status?: string | false;
  sku?: string | false;
}

export interface ShopfrontCanonicalTemplate {
  id: number;
  shopfront_source_ref?: string | false;
  active?: boolean;
  sale_ok?: boolean;
  default_code?: string | false;
}

export interface ShopfrontInventoryProduct extends ShopfrontSourceIdentity {
  name?: string | false;
  category?: string | false;
  case_quantity?: number | false;
  cost?: number | false;
  price?: number | false;
  track_inventory?: boolean;
  raw_payload?: unknown;
}

export interface ShopfrontInventorySourceRow {
  source_product_id: string;
  quantity?: number;
  single_level?: number;
  case_level?: number;
  snapshot_at?: string;
}

export interface ShopfrontCatalogueMapping {
  templateIds: number[];
  activeProductCount: number;
  mappedProductCount: number;
  unmappedProductCount: number;
  ambiguousReferenceCount: number;
}

export type ShopfrontFieldStatus = "available" | "missing" | "unavailable" | "restricted";

export function shopfrontFieldStatus(readStatus: "available" | "unavailable" | "restricted", value: unknown): ShopfrontFieldStatus {
  if (readStatus !== "available") return readStatus;
  return typeof value === "number" && Number.isFinite(value) ? "available" : "missing";
}

export function shopfrontCostFromPayload(value: unknown, payload: unknown): number | null {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const raw = payload as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(raw, "cost")) {
      return typeof raw.cost === "number" && Number.isFinite(raw.cost) ? raw.cost : null;
    }
  }
  return typeof value === "number" && Number.isFinite(value) && value !== 0 ? value : null;
}

export function resolveShopfrontCatalogueMappings(
  storeKey: string,
  sourceRows: ShopfrontSourceIdentity[],
  templates: ShopfrontCanonicalTemplate[],
): ShopfrontCatalogueMapping {
  const sourceByRef = new Map(sourceRows
    .filter((row) => String(row.source_status || "").toUpperCase() === "ACTIVE" && /^[0-9a-f]{24,64}$/i.test(row.source_id))
    .map((row) => [`${storeKey}:${row.source_id}`, row] as const));
  const templatesByRef = new Map<string, ShopfrontCanonicalTemplate[]>();
  for (const template of templates) {
    if (typeof template.shopfront_source_ref !== "string") continue;
    const candidates = templatesByRef.get(template.shopfront_source_ref) ?? [];
    candidates.push(template);
    templatesByRef.set(template.shopfront_source_ref, candidates);
  }

  const templateIds: number[] = [];
  let ambiguousReferenceCount = 0;
  for (const [ref, source] of sourceByRef) {
    const candidates = templatesByRef.get(ref) ?? [];
    if (!candidates.length) continue;
    if (candidates.length > 1) ambiguousReferenceCount += 1;
    const sourceSku = typeof source.sku === "string" ? source.sku.trim().toLowerCase() : "";
    const exactSku = sourceSku ? candidates.filter((candidate) => typeof candidate.default_code === "string" && candidate.default_code.trim().toLowerCase() === sourceSku) : [];
    const pool = exactSku.length === 1 ? exactSku : candidates;
    const activeSaleable = pool.filter((candidate) => candidate.active !== false && candidate.sale_ok === true);
    const activeCandidates = pool.filter((candidate) => candidate.active !== false);
    const chosen = (activeSaleable.length ? activeSaleable : activeCandidates.length ? activeCandidates : pool)
      .sort((left, right) => left.id - right.id)[0];
    if (Number.isSafeInteger(chosen.id) && chosen.id > 0) templateIds.push(chosen.id);
  }
  const uniqueTemplateIds = [...new Set(templateIds)];
  return {
    templateIds: uniqueTemplateIds,
    activeProductCount: sourceByRef.size,
    mappedProductCount: uniqueTemplateIds.length,
    unmappedProductCount: sourceByRef.size - uniqueTemplateIds.length,
    ambiguousReferenceCount,
  };
}

export function summarizeShopfrontInventory(
  rows: Array<{ source_product_id: string; quantity?: number; snapshot_at?: string }>,
  activeSourceIds: Set<string>,
) {
  let positiveInventoryUnits = 0;
  let negativeInventoryRows = 0;
  let inventorySnapshotAt: string | null = null;
  const inventoryProducts = new Set<string>();
  for (const row of rows) {
    if (!activeSourceIds.has(row.source_product_id)) continue;
    const stock = Number(row.quantity ?? 0);
    if (!Number.isFinite(stock)) continue;
    positiveInventoryUnits += Math.max(0, stock);
    if (stock < 0) negativeInventoryRows += 1;
    inventoryProducts.add(row.source_product_id);
    if (typeof row.snapshot_at === "string" && row.snapshot_at > (inventorySnapshotAt ?? "")) inventorySnapshotAt = row.snapshot_at;
  }
  return { positiveInventoryUnits, negativeInventoryRows, inventoryProductRows: inventoryProducts.size, inventorySnapshotAt };
}

export function enrichShopfrontInventoryRows<
  T extends { id: number; product_tmpl_id?: [number, string] | false },
>(
  rows: T[],
  storeKey: string,
  sourceProducts: ShopfrontInventoryProduct[],
  templates: ShopfrontCanonicalTemplate[],
  inventoryRows: ShopfrontInventorySourceRow[],
  costReadStatus: "available" | "unavailable" | "restricted",
  inventoryReadStatus: "available" | "unavailable",
) {
  const mapping = resolveShopfrontCatalogueMappings(storeKey, sourceProducts, templates);
  const canonicalTemplates = new Set(mapping.templateIds);
  const sourceIdByTemplate = new Map<number, string>();
  for (const template of templates) {
    if (!canonicalTemplates.has(template.id) || typeof template.shopfront_source_ref !== "string") continue;
    const prefix = `${storeKey}:`;
    if (template.shopfront_source_ref.startsWith(prefix)) {
      sourceIdByTemplate.set(template.id, template.shopfront_source_ref.slice(prefix.length));
    }
  }
  const productsById = new Map(sourceProducts.map((product) => [product.source_id, product]));
  const inventoryById = new Map(inventoryRows.map((inventory) => [inventory.source_product_id, inventory]));

  return rows.map((row) => {
    const templateId = Array.isArray(row.product_tmpl_id) ? Number(row.product_tmpl_id[0]) : 0;
    const sourceId = sourceIdByTemplate.get(templateId);
    const source = sourceId ? productsById.get(sourceId) : undefined;
    const inventory = sourceId ? inventoryById.get(sourceId) : undefined;
    const raw = source?.raw_payload && typeof source.raw_payload === "object" && !Array.isArray(source.raw_payload)
      ? source.raw_payload as Record<string, unknown>
      : {};
    const sourceCost = costReadStatus === "available" ? shopfrontCostFromPayload(source?.cost, raw) : null;
    const sourcePrice = typeof source?.price === "number" && Number.isFinite(source.price) ? source.price : null;
    const quantity = typeof inventory?.quantity === "number" && Number.isFinite(inventory.quantity) ? inventory.quantity : null;
    const taxName = (value: unknown) => {
      if (typeof value === "string" && value.trim()) return value.trim();
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const name = (value as { name?: unknown }).name;
        if (typeof name === "string" && name.trim()) return name.trim();
      }
      return null;
    };
    return {
      ...row,
      shopfront_data_status: source ? "available" as const : "missing" as const,
      shopfront_source_ref: sourceId ? `${storeKey}:${sourceId}` : null,
      shopfront_source_name: typeof source?.name === "string" ? source.name : null,
      shopfront_source_sku: typeof source?.sku === "string" ? source.sku : null,
      shopfront_source_category: typeof source?.category === "string" ? source.category : null,
      shopfront_source_status: source?.source_status ?? null,
      shopfront_track_inventory: typeof source?.track_inventory === "boolean" ? source.track_inventory : null,
      shopfront_case_quantity: typeof source?.case_quantity === "number" && Number.isFinite(source.case_quantity) && source.case_quantity > 0 ? source.case_quantity : null,
      shopfront_cost: sourceCost,
      shopfront_cost_status: shopfrontFieldStatus(costReadStatus, sourceCost),
      shopfront_purchase_tax_rate: taxName(raw.costTaxRate ?? raw.cost_tax_rate),
      shopfront_retail_tax_rate: taxName(raw.taxRate ?? raw.tax_rate),
      shopfront_price: sourcePrice,
      shopfront_quantity: quantity,
      shopfront_single_level: typeof inventory?.single_level === "number" && Number.isFinite(inventory.single_level) ? inventory.single_level : null,
      shopfront_case_level: typeof inventory?.case_level === "number" && Number.isFinite(inventory.case_level) ? inventory.case_level : null,
      shopfront_inventory_status: shopfrontFieldStatus(inventoryReadStatus, quantity),
      shopfront_inventory_snapshot_at: inventory?.snapshot_at ?? null,
    };
  });
}
