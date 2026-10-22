package com.orithos.modules.ai.pricing;

/** One price-review line for an in-chat brief (read-only). */
public record PriceReviewItem(
        long productId,
        String name,
        double soldUnits,
        Double currentPrice,
        Double suggestedPrice,
        String status
) {
}
