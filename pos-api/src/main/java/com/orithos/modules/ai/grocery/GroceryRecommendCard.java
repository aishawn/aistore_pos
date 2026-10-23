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
        BigDecimal caseQuantity,
        int matchPct,
        String reason
) {}
