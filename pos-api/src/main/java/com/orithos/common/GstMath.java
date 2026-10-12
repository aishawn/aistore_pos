package com.orithos.common;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Australian shelf prices are GST-inclusive. The GST component of an inclusive
 * amount is {@code price × rate / (100 + rate)} (10% GST is one eleventh).
 */
public final class GstMath {

    public static final BigDecimal DEFAULT_RATE = new BigDecimal("10");

    private GstMath() {
    }

    public static BigDecimal includedGst(BigDecimal inclusive, BigDecimal ratePercent) {
        if (inclusive == null || inclusive.signum() == 0 || ratePercent == null || ratePercent.signum() <= 0) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        return inclusive.multiply(ratePercent)
                .divide(BigDecimal.valueOf(100).add(ratePercent), 2, RoundingMode.HALF_UP);
    }

    public static BigDecimal exclusiveOfGst(BigDecimal inclusive, BigDecimal ratePercent) {
        BigDecimal gross = inclusive == null ? BigDecimal.ZERO : inclusive;
        return gross.subtract(includedGst(gross, ratePercent)).setScale(2, RoundingMode.HALF_UP);
    }
}
