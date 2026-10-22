package com.orithos.modules.ai.pricing;

/** Sale tax row used for margin-based shelf price suggestions. */
public record SuggestionTax(
        long id,
        double amount,
        String amountType,
        boolean priceInclude,
        boolean includeBaseAmount
) {
}
