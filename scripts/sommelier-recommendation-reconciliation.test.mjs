import assert from "node:assert/strict";
import test from "node:test";
import { reconcileRecommendationCard, recommendationMismatchFields } from "./sommelier-recommendation-reconciliation.mjs";

const card = {
  productId: 42,
  name: "Example Shiraz",
  listPrice: 25,
  sellPrice: 20,
  onPromotion: true,
  stockQuantity: 4,
};
const product = { id: 42, name: "Example Shiraz", price: 25, stockQuantity: 4 };
const wineDetail = { productId: 42, name: "Example Shiraz", sellPrice: 20, onPromotion: true };

test("accepts recommendation facts matching the current wine catalog", () => {
  assert.equal(reconcileRecommendationCard(card, { ...product, id: "42" }, wineDetail), true);
});

test("rejects a price, promotion, or stock mismatch", () => {
  assert.equal(reconcileRecommendationCard(card, { ...product, price: 26 }, wineDetail), false);
  assert.equal(reconcileRecommendationCard(card, product, { ...wineDetail, sellPrice: 21 }), false);
  assert.equal(reconcileRecommendationCard(card, product, { ...wineDetail, onPromotion: false }), false);
  assert.equal(reconcileRecommendationCard({ ...card, stockQuantity: 5 }, product, wineDetail), false);
});

test("rejects missing catalog facts and a different product", () => {
  assert.equal(reconcileRecommendationCard(card, { ...product, price: null }, wineDetail), false);
  assert.equal(reconcileRecommendationCard(card, { ...product, id: 43 }, wineDetail), false);
  assert.equal(reconcileRecommendationCard(card, product, null), false);
});

test("reports mismatched fields without exposing product data", () => {
  assert.deepEqual(recommendationMismatchFields(card, { ...product, price: 26 }, wineDetail), ["list_price"]);
});
