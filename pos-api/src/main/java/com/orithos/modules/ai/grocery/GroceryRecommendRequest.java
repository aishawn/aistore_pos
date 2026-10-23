package com.orithos.modules.ai.grocery;

import java.math.BigDecimal;

public record GroceryRecommendRequest(
        String category,
        BigDecimal budgetMin,
        BigDecimal budgetMax,
        String occasion
) {}
