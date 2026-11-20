function amount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function reconcileRecommendationCard(card, catalogWine) {
  if (!card || !catalogWine || String(card.productId) !== String(catalogWine.productId)) return false;
  const cardListPrice = amount(card.listPrice);
  const catalogListPrice = amount(catalogWine.listPrice);
  const cardSellPrice = amount(card.sellPrice);
  const catalogSellPrice = amount(catalogWine.sellPrice);
  const cardStock = amount(card.stockQuantity);
  const catalogStock = amount(catalogWine.stockQuantity);
  return cardListPrice !== null
    && catalogListPrice !== null
    && cardSellPrice !== null
    && catalogSellPrice !== null
    && cardStock !== null
    && catalogStock !== null
    && cardListPrice === catalogListPrice
    && cardSellPrice === catalogSellPrice
    && cardStock === catalogStock
    && card.onPromotion === catalogWine.onPromotion;
}
