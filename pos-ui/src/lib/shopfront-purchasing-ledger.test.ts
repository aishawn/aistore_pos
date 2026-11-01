import test from "node:test";
import assert from "node:assert/strict";
import { loadPurchasingLedger, mergePurchasingSources } from "./shopfront-purchasing-ledger.ts";
import { normalizePurchasingRow } from "./shopfront-purchasing.ts";

const supplier = (id: string) => normalizePurchasingRow({ source_id: id, name: id }, "suppliers");

test("an empty or partial crawler retains durable suppliers, deduplicating new IDs", () => {
  const ledger = [supplier("a"), supplier("b")];
  assert.deepEqual(mergePurchasingSources(ledger, [], "suppliers"), ledger);
  const updated = { ...supplier("a"), phone: "123" };
  const merged = mergePurchasingSources(ledger, [updated, supplier("c")], "suppliers");
  assert.deepEqual(merged.map((row) => row.id), ["a", "b", "c"]);
  assert.equal(merged[0].phone, "123");
});

test("supplier ledger reads are scoped to company and store, including inactive contacts", async () => {
  const rpc: Parameters<typeof loadPurchasingLedger>[0] = async <T>(model: string, method: string, args: unknown[], kwargs?: Record<string, unknown>) => {
    assert.equal(model, "res.partner");
    assert.equal(kwargs?.active_test, false);
    assert.deepEqual((args[0] as unknown[]).slice(0, 2), [["company_id", "=", 27], ["shopfront_supplier_ref", "=like", "skr:%"]]);
    return (method === "search_count" ? 1 : [{ id: 10, name: "Real supplier", shopfront_supplier_ref: "skr:source-1", shopfront_supplier_status: "INACTIVE", shopfront_supplier_payload: { businessNumber: "ABN", contact: { phone: "555", email: "supplier@example.com" } } }]) as T;
  };
  const rows = await loadPurchasingLedger(rpc, 27, "skr", "suppliers");
  assert.equal(rows[0].id, "source-1");
  assert.equal(rows[0].status, "INACTIVE");
  assert.equal(rows[0].phone, "555");
  assert.equal(rows[0].taxId, "ABN");
  await assert.rejects(loadPurchasingLedger(rpc, 27, "another-store", "suppliers"));
});

test("source orders without a native purchase ID retain raw reference, zero amounts and lines", async () => {
  const rpc: Parameters<typeof loadPurchasingLedger>[0] = async <T>(model: string, method: string, args: unknown[]) => {
    assert.equal(model, "shopfront.sync.purchase.order");
    assert.deepEqual((args[0] as unknown[]).slice(0, 2), [["company_id", "=", 27], ["store_key", "=", "skr"]]);
    return (method === "search_count" ? 1 : [{ id: 1, source_id: "order-1", source_status: "CANCELLED", source_total: 123, order_date: "2023-11-15", raw_payload: { invoiceNumber: "94209", totalCost: 0, products: [{ item: { name: "Product" }, orderedQuantity: 6, receivedQuantity: 0, orderedCost: 0 }] } }]) as T;
  };
  const [row] = await loadPurchasingLedger(rpc, 27, "skr", "purchase-orders");
  assert.equal(row.name, "94209");
  assert.equal(row.total, "0.0000");
  assert.equal(row.lines[0].received, 0);
  assert.equal(row.lines[0].cost, 0);
});

test("partial source reads fail rather than return a false count", async () => {
  const rpc: Parameters<typeof loadPurchasingLedger>[0] = async <T>(_model: string, method: string) => (method === "search_count" ? 2 : []) as T;
  await assert.rejects(loadPurchasingLedger(rpc, 27, "skr", "suppliers"), /Incomplete/);
});
