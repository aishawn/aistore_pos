package com.orithos.modules.ai.replenishment;

/**
 * One restock line for an in-chat brief (read-only; not a purchase order).
 */
public record ReplenishmentSuggestion(
        long productId,
        String name,
        String unit,
        double suggestedQuantity,
        Double daysOfStock,
        double unitsPerDay
) {
}
