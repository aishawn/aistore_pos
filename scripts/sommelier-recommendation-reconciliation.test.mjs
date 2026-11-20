import assert from "node:assert/strict";
import test from "node:test";
import { reconcileRecommendationCard } from "./sommelier-recommendation-reconciliation.mjs";

const card = {
  productId: 42,
  listPrice: 25,
  sellPrice: 20,
  onPromotion: true,
  stockQuantity: 4,
};

test("accepts recommendation facts matching the current wine catalog", () => {
  assert.equal(reconcileRecommendationCard(card, { ...card, productId: "42" }), true);
});

test("rejects a price, promotion, or stock mismatch", () => {
  for (const catalogWine of [
    { ...card, listPrice: 26 },
    { ...card, sellPrice: 21 },
    { ...card, onPromotion: false },
    { ...card, stockQuantity: 3 },
  ]) assert.equal(reconcileRecommendationCard(card, catalogWine), false);
});

test("rejects missing catalog facts and a different product", () => {
  assert.equal(reconcileRecommendationCard(card, { productId: 42 }), false);
  assert.equal(reconcileRecommendationCard(card, { ...card, productId: 43 }), false);
});
