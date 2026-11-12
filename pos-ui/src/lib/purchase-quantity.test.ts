import test from "node:test";
import assert from "node:assert/strict";
import { formatPurchaseQuantity } from "./purchase-quantity.ts";

test("purchase quantities display the same case and item split as Shopfront", () => {
  assert.equal(formatPurchaseQuantity(12, 12), "1 case");
  assert.equal(formatPurchaseQuantity(20, 12), "1 case + 8 items");
  assert.equal(formatPurchaseQuantity(8, 16), "8 items");
  assert.equal(formatPurchaseQuantity(0, 16), "0 items");
});
