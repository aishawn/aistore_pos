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
        double unitsPerDay,
        Double onHand,
        Double forecastAvailable
) {
    public ReplenishmentSuggestion(long productId, String name, String unit, double suggestedQuantity,
                                   Double daysOfStock, double unitsPerDay) {
        this(productId, name, unit, suggestedQuantity, daysOfStock, unitsPerDay, null, null);
    }
}
