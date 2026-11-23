package com.orithos.modules.ai.grocery;

import java.math.BigDecimal;

public record GroceryRecommendCard(
        long productId,
        String name,
        String tier,
        String badge,
        String category,
        BigDecimal listPrice,
        BigDecimal sellPrice,
        BigDecimal stockQuantity,
        BigDecimal saleQuantity,
        BigDecimal caseQuantity,
        int matchPct,
        String reason,
        String promotionName,
        String promotionEndsAt
) {
    public GroceryRecommendCard(long productId, String name, String tier, String badge, String category,
                                BigDecimal listPrice, BigDecimal sellPrice, BigDecimal stockQuantity,
                                BigDecimal saleQuantity, BigDecimal caseQuantity, int matchPct, String reason) {
        this(productId, name, tier, badge, category, listPrice, sellPrice, stockQuantity, saleQuantity,
                caseQuantity, matchPct, reason, null, null);
    }
}
