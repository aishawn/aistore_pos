package com.orithos.common;

import java.math.BigDecimal;

/** Validates numeric quantities that must be present and greater than zero. */
public final class QuantityUtils {

    private QuantityUtils() {}

    public static void validatePositive(BigDecimal quantity, String fieldLabel) {
        if (quantity == null) {
            throw new BusinessException(fieldLabel + " is required.");
        }
        if (quantity.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException(fieldLabel + " must be greater than zero.");
        }
    }

    public static void validateNonNegative(BigDecimal value, String fieldLabel) {
        if (value == null) {
            return;
        }
        if (value.compareTo(BigDecimal.ZERO) < 0) {
            throw new BusinessException(fieldLabel + " cannot be negative.");
        }
    }
}
