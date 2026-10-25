import assert from "node:assert/strict";
import test from "node:test";
import { entityActionPage, isReadOnlyEntityOperation } from "./ai-entity-routing.ts";

test("resolves legacy write intents to the correct page CTA by entity", () => {
  const expected = new Map([
    ["customer_group", "/customer-groups"],
    ["balance", "/customers/balances"],
    ["price_list", "/pricelists"],
    ["stocktake", "/products?dialog=stocktake"],
    ["buying_period", "/stock/buying-periods"],
    ["gift_card", "/giftcards"],
    ["bulk_price_edit", "/stock/bulk-price-edit"],
    ["product", "/products"],
    ["customer", "/customers"],
  ]);

  for (const [entity, route] of expected) {
    assert.equal(entityActionPage(entity), route, entity);
  }
  assert.equal(entityActionPage("unknown"), null);
});

test("legacy entity writes are never dispatched as read-only actions", () => {
  for (const operation of ["list", "search", "view", "get", "lookup", "find", "show"]) {
    assert.equal(isReadOnlyEntityOperation(operation), true, operation);
  }
  for (const operation of ["create", "edit", "delete", "merge", "import", "receive", "adjust"]) {
    assert.equal(isReadOnlyEntityOperation(operation), false, operation);
  }
  assert.equal(isReadOnlyEntityOperation(" DELETE "), false);
  assert.equal(isReadOnlyEntityOperation(null), false);
});
