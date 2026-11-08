import assert from "node:assert/strict";
import test from "node:test";
import { enrichShopfrontInventoryRows, pickShopfrontInventoryRow, resolveShopfrontCatalogueMappings, shopfrontCostFromPayload, shopfrontFieldStatus, shopfrontInventoryBySource, shopfrontTrackInventory, summarizeShopfrontInventory } from "./shopfront-catalogue.ts";

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

test("source field status distinguishes a real zero from missing or unreadable data", () => {
  assert.equal(shopfrontFieldStatus("available", 0), "available");
  assert.equal(shopfrontFieldStatus("available", 4), "available");
  assert.equal(shopfrontFieldStatus("available", null), "missing");
  assert.equal(shopfrontFieldStatus("unavailable", null), "unavailable");
  assert.equal(shopfrontFieldStatus("restricted", null), "restricted");
});

test("Shopfront raw payload distinguishes a true zero cost from the mirror's default zero", () => {
  assert.equal(shopfrontCostFromPayload(0, { cost: 0 }), 0);
  assert.equal(shopfrontCostFromPayload(0, {}), null);
  assert.equal(shopfrontCostFromPayload(4.25, {}), 4.25);
  assert.equal(shopfrontCostFromPayload(12, { cost: null }), null);
});

test("inventory report enrichment uses the canonical Shopfront mapping and preserves zero values", () => {
  const sourceId = "a".repeat(32);
  const product = {
    source_id: sourceId, source_status: "ACTIVE", name: "Wine", sku: "W1", category: "Red",
    case_quantity: 6, cost: 0, price: 0, track_inventory: true, raw_payload: { cost: 0 },
  };
  const result = enrichShopfrontInventoryRows(
    [{ id: 10, product_tmpl_id: [2, "Wine"] }, { id: 11, product_tmpl_id: [3, "Duplicate"] }],
    "skr",
    [product],
    [template(2, sourceId, { default_code: "W1" }), template(3, sourceId, { default_code: "OTHER" })],
    [{ source_product_id: sourceId, quantity: 0, single_level: 0, case_level: 0, snapshot_at: "2026-11-08T00:00:00Z" }],
    "available",
    "available",
  );

  assert.equal(result[0].shopfront_source_category, "Red");
  assert.equal(result[0].shopfront_cost, 0);
  assert.equal(result[0].shopfront_cost_status, "available");
  assert.equal(result[0].shopfront_quantity, 0);
  assert.equal(result[0].shopfront_inventory_status, "available");
  assert.equal(result[1].shopfront_data_status, "missing");
});

test("inventory report enrichment labels restricted cost and unavailable inventory separately", () => {
  const sourceId = "b".repeat(32);
  const result = enrichShopfrontInventoryRows(
    [{ id: 10, product_tmpl_id: [2, "Wine"] }],
    "skr",
    [{ source_id: sourceId, source_status: "ACTIVE", sku: "W1", cost: 12 }],
    [template(2, sourceId, { default_code: "W1" })],
    [],
    "restricted",
    "unavailable",
  );

  assert.equal(result[0].shopfront_cost_status, "restricted");
  assert.equal(result[0].shopfront_inventory_status, "unavailable");
  assert.equal(result[0].shopfront_quantity, null);
});

test("track inventory falls back to Shopfront raw payload and stays unknown when absent", () => {
  assert.equal(shopfrontTrackInventory(false, {}), false);
  assert.equal(shopfrontTrackInventory(null, { trackInventory: true }), true);
  assert.equal(shopfrontTrackInventory(undefined, { trackInventory: false }), false);
  assert.equal(shopfrontTrackInventory(null, {}), null);
});

test("inventory row picker prefers the newest snapshot across outlets", () => {
  const picked = pickShopfrontInventoryRow([
    { source_product_id: "p1", quantity: 1, snapshot_at: "2026-11-07T00:00:00", outlet_id: "a" },
    { source_product_id: "p1", quantity: 9, snapshot_at: "2026-11-08T00:00:00", outlet_id: "b" },
  ]);
  assert.equal(picked?.quantity, 9);
  const bySource = shopfrontInventoryBySource([
    { source_product_id: "p1", quantity: 3, snapshot_at: "2026-11-08T00:00:00", outlet_id: "a", single_level: 4, case_level: 0 },
    { source_product_id: "p1", quantity: 99, snapshot_at: "2026-11-01T00:00:00", outlet_id: "b", single_level: 1, case_level: 1 },
  ]);
  assert.equal(bySource.get("p1")?.single_level, 4);
});
