function amount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function recommendationMismatchFields(card, product, wineDetail) {
  const mismatches = [];
  if (!card || !product) return ["product_catalog_missing"];
  if (!wineDetail) return ["wine_detail_missing"];
  if (String(card.productId) !== String(product.id)) mismatches.push("product_id");
  if (String(card.productId) !== String(wineDetail.productId)) mismatches.push("wine_detail_id");
  if (card.name !== product.name) mismatches.push("product_name");
  if (card.name !== wineDetail.name) mismatches.push("wine_detail_name");
  const cardListPrice = amount(card.listPrice);
  const catalogListPrice = amount(product.price);
  const cardSellPrice = amount(card.sellPrice);
  const catalogSellPrice = amount(wineDetail.sellPrice);
  const cardStock = amount(card.stockQuantity);
  const catalogStock = amount(product.stockQuantity);
  if (cardListPrice === null || catalogListPrice === null || cardListPrice !== catalogListPrice) {
    mismatches.push("list_price");
  }
  if (cardSellPrice === null || catalogSellPrice === null || cardSellPrice !== catalogSellPrice) {
    mismatches.push("sell_price");
  }
  if (catalogStock === null || cardStock === null || cardStock < 0 || cardStock !== catalogStock) {
    mismatches.push("stock_total");
  }
  if (card.onPromotion !== wineDetail.onPromotion) mismatches.push("promotion_flag");
  return mismatches;
}

export function reconcileRecommendationCard(card, product, wineDetail) {
  return recommendationMismatchFields(card, product, wineDetail).length === 0;
}
