import assert from "node:assert/strict";
import test from "node:test";
import { resolveShopfrontCatalogueMappings, summarizeShopfrontInventory } from "./shopfront-catalogue.ts";

const active = (source_id: string, sku?: string) => ({ source_id, source_status: "ACTIVE", sku });
const template = (id: number, sourceId: string, values: Record<string, unknown> = {}) => ({ id, shopfront_source_ref: `skr:${sourceId}`, active: true, sale_ok: true, ...values });

test("only active Shopfront source IDs contribute to the catalogue total", () => {
  const result = resolveShopfrontCatalogueMappings("skr", [active("a".repeat(32)), { source_id: "b".repeat(32), source_status: "ARCHIVED" }], [template(1, "a".repeat(32))]);
  assert.deepEqual(result, { templateIds: [1], activeProductCount: 1, mappedProductCount: 1, unmappedProductCount: 0, ambiguousReferenceCount: 0 });
});

test("a unique SKU match selects the matching canonical template but reports the duplicate", () => {
  const sourceId = "c".repeat(32);
  const result = resolveShopfrontCatalogueMappings("skr", [active(sourceId, "SKU-1")], [
    template(9, sourceId, { default_code: "OLD" }),
    template(7, sourceId, { default_code: "SKU-1" }),
  ]);
  assert.deepEqual(result.templateIds, [7]);
  assert.equal(result.ambiguousReferenceCount, 1);
});

test("missing and shared Odoo mappings are counted instead of hidden", () => {
  const missing = "d".repeat(32);
  const shared = "e".repeat(32);
  const result = resolveShopfrontCatalogueMappings("skr", [active(missing), active(shared), active("f".repeat(32))], [
    template(3, shared), template(4, shared), template(3, "f".repeat(32)),
  ]);
  assert.deepEqual(result, { templateIds: [3], activeProductCount: 3, mappedProductCount: 1, unmappedProductCount: 2, ambiguousReferenceCount: 1 });
});

test("source stock totals preserve negative rows while counting positive units separately", () => {
  const summary = summarizeShopfrontInventory([
    { source_product_id: "active", quantity: 12, snapshot_at: "2026-11-06T12:00:00" },
    { source_product_id: "negative", quantity: -4, snapshot_at: "2026-11-06T13:00:00" },
    { source_product_id: "inactive", quantity: 99, snapshot_at: "2026-11-06T14:00:00" },
  ], new Set(["active", "negative"]));
  assert.deepEqual(summary, { positiveInventoryUnits: 12, negativeInventoryRows: 1, inventoryProductRows: 2, inventorySnapshotAt: "2026-11-06T13:00:00" });
});
