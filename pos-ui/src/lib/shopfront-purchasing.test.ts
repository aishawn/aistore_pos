import test from "node:test";
import assert from "node:assert/strict";
import { filterPurchasingRows, normalizePurchasingRow } from "./shopfront-purchasing.ts";

test("Shopfront supplier history normalizes contact details and retains source status", () => {
  const supplier = normalizePurchasingRow({
    source_id: "skr:source-12",
    name: "Example Wines",
    business_number: "ABN-12",
    status: "INACTIVE",
    raw_payload: { contact: { phone: "0400000000", email: "orders@example.test" } },
  }, "suppliers");

  assert.equal(supplier.name, "Example Wines");
  assert.equal(supplier.status, "INACTIVE");
  assert.equal(supplier.taxId, "ABN-12");
  assert.equal(filterPurchasingRows([supplier], "orders@example.test", "all").length, 1);
  assert.equal(filterPurchasingRows([supplier], "", "ACTIVE").length, 0);
});

test("Shopfront archived purchase history searches product detail and filters status", () => {
  const order = normalizePurchasingRow({
    source_id: "skr:po-42",
    status: "CLOSED",
    order_date: "2026-11-05",
    total_cost: "125.50",
    raw_payload: {
      invoiceNumber: "INV-42",
      products: [{ supplier: { name: "Example Wines" }, item: { name: "Red Blend" }, orderedQuantity: 5, receivedQuantity: 5, orderedCost: 25.1 }],
    },
  }, "purchase-orders");

  assert.equal(order.name, "INV-42");
  assert.equal(order.lines[0]?.received, 5);
  assert.equal(filterPurchasingRows([order], "red blend", "CLOSED").length, 1);
  assert.equal(filterPurchasingRows([order], "missing", "CLOSED").length, 0);
  assert.equal(filterPurchasingRows([order], "red blend", "OPEN").length, 0);
});
