package com.orithos.modules.ai.sommelier.dto;

import java.math.BigDecimal;
import java.util.List;

public record RecommendRequest(
        String wineType,
        BigDecimal budgetMin,
        BigDecimal budgetMax,
        Double dryness,
        Double body,
        Double fruitiness,
        Double oak,
        Double tannin,
        List<String> food,
        String occasion
) {
    public RecommendRequest {
        food = food == null ? List.of() : List.copyOf(food);
    }
}
