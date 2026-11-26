import test from "node:test";
import assert from "node:assert/strict";
import * as purchaseQuantity from "./purchase-quantity.ts";

test("purchase quantities display the same case and item split as Shopfront", () => {
  assert.equal(purchaseQuantity.formatPurchaseQuantity(12, 12), "1 case");
  assert.equal(purchaseQuantity.formatPurchaseQuantity(20, 12), "1 case + 8 items");
  assert.equal(purchaseQuantity.formatPurchaseQuantity(8, 16), "8 items");
  assert.equal(purchaseQuantity.formatPurchaseQuantity(0, 16), "0 items");
});

test("suggested quantities distinguish data review from order-ready quantities", () => {
  assert.equal(purchaseQuantity.formatSuggestedPurchaseQuantity(6, 6, "REVIEW_DATA"), "Review · 1 case");
  assert.equal(purchaseQuantity.formatSuggestedPurchaseQuantity(12, 6, "READY"), "Order 2 cases");
});

test("a zero quantity removes the line even when the assistant suggested ordering it", () => {
  const removed = { productId: 101, quantity: 0, suggestedQuantity: 24 };
  const accepted = { productId: 102, quantity: 12, suggestedQuantity: 12 };
  assert.deepEqual(purchaseQuantity.positivePurchaseLines([removed, accepted]), [accepted]);
  assert.deepEqual(purchaseQuantity.positivePurchaseLines([removed]), []);
});

test("purchase estimates cover the remaining lines and identify unknown costs", () => {
  assert.deepEqual(purchaseQuantity.estimatePurchaseValue([
    { quantity: 12, unitCost: 2.5 },
    { quantity: 0, unitCost: null },
    { quantity: 6, unitCost: null },
  ]), { subtotal: 30, missingCosts: 1 });
});
