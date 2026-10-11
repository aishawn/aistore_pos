package com.orithos.common;

import java.math.BigDecimal;

/** Validates product case quantity (units per case). */
public final class CaseQuantityUtils {

    private CaseQuantityUtils() {}

    public static void validate(BigDecimal caseQuantity) {
        QuantityUtils.validatePositive(caseQuantity, "Case quantity");
    }
}
