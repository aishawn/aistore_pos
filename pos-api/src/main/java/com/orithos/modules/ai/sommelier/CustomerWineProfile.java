package com.orithos.modules.ai.sommelier;

import java.math.BigDecimal;
import java.util.List;

public record CustomerWineProfile(
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
    public CustomerWineProfile {
        food = food == null ? List.of() : List.copyOf(food);
        wineType = wineType == null || wineType.isBlank() ? "not_sure" : wineType.trim().toLowerCase();
        occasion = occasion == null || occasion.isBlank() ? null : occasion.trim().toLowerCase();
    }

    public boolean hasTypeFilter() {
        return wineType != null && !"not_sure".equals(wineType) && !"unknown".equals(wineType);
    }

    public boolean hasBudget() {
        return budgetMin != null || budgetMax != null;
    }
}
