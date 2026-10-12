package com.orithos.common;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Australian cash rounding: 1c and 2c coins are not in circulation, so a cash
 * tender settles to the nearest 5 cents. 1–2 round down, 3–4 and 8–9 round up,
 * 6–7 round down to 5. Card and other electronic tenders stay exact.
 */
public final class CashRounding {

    private CashRounding() {
    }

    public static BigDecimal toNearestFiveCents(BigDecimal amount) {
        if (amount == null || amount.signum() == 0) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.UNNECESSARY);
        }
        int sign = amount.signum();
        BigDecimal cents = amount.abs().movePointRight(2).setScale(0, RoundingMode.HALF_UP);
        int remainder = cents.remainder(BigDecimal.valueOf(5)).intValue();
        int delta = remainder == 0 ? 0 : remainder <= 2 ? -remainder : 5 - remainder;
        BigDecimal rounded = cents.add(BigDecimal.valueOf(delta)).movePointLeft(2).setScale(2, RoundingMode.UNNECESSARY);
        return sign < 0 ? rounded.negate() : rounded;
    }

    /** Signed difference applied to a cash settlement: rounded minus original. */
    public static BigDecimal difference(BigDecimal amount) {
        return toNearestFiveCents(amount).subtract(amount == null
                ? BigDecimal.ZERO.setScale(2, RoundingMode.UNNECESSARY)
                : amount.setScale(2, RoundingMode.HALF_UP));
    }
}
