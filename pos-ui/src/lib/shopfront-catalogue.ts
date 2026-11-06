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

export interface ShopfrontCatalogueMapping {
  templateIds: number[];
  activeProductCount: number;
  mappedProductCount: number;
  unmappedProductCount: number;
  ambiguousReferenceCount: number;
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
