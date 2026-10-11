package com.orithos.common;

import java.math.BigDecimal;

/** Validates product price quantity (units per price break). */
public final class PriceQuantityUtils {

    private PriceQuantityUtils() {}

    public static void validate(BigDecimal priceQuantity) {
        QuantityUtils.validatePositive(priceQuantity, "Price quantity");
    }

    /** Null is allowed (price not supplied). Zero and negative prices are rejected. */
    public static void validatePrice(BigDecimal price) {
        if (price == null) {
            return;
        }
        if (price.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException("Price must be greater than zero.");
        }
    }

    public static void validateRow(BigDecimal priceQuantity, BigDecimal price) {
        validate(priceQuantity);
        if (price == null) {
            throw new BusinessException("Price is required.");
        }
        validatePrice(price);
    }
}
