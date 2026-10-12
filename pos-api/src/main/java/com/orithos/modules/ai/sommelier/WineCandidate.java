package com.orithos.modules.ai.sommelier;

import java.math.BigDecimal;

public record WineCandidate(
        Long productId,
        String name,
        String description,
        String image,
        String categoryName,
        String familyName,
        String brandName,
        BigDecimal listPrice,
        BigDecimal sellPrice,
        boolean onPromotion,
        BigDecimal stockQuantity,
        boolean trackInventory,
        BigDecimal caseQuantity,
        WineProfile profile
) {
    public BigDecimal effectivePrice() {
        return sellPrice != null ? sellPrice : (listPrice != null ? listPrice : BigDecimal.ZERO);
    }

    public double stock() {
        return stockQuantity == null ? 0d : stockQuantity.doubleValue();
    }

    public boolean inStock() {
        if (!trackInventory) return true;
        return stock() > 0d;
    }
}
