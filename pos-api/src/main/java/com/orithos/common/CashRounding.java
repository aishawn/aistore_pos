package com.orithos.common;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Australian cash rounding: by default 1c and 2c coins are not in circulation, so a cash
 * tender settles to the nearest 5 cents. 1–2 round down, 3–4 and 8–9 round up,
 * 6–7 round down to 5. Card and other electronic tenders stay exact.
 *
 * The increment is configurable via company setting {@code company.currency.round_to}
 * (default 0.05). When increment is 0.01 or less, amounts stay exact at 2dp.
 */
public final class CashRounding {

    private static final BigDecimal FIVE_CENTS = new BigDecimal("0.05");

    private CashRounding() {
    }

    public static BigDecimal toNearestFiveCents(BigDecimal amount) {
        return roundTo(amount, FIVE_CENTS);
    }

    public static BigDecimal roundTo(BigDecimal amount, BigDecimal increment) {
        if (amount == null || amount.signum() == 0) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.UNNECESSARY);
        }
        BigDecimal step = increment == null || increment.signum() <= 0 ? FIVE_CENTS : increment;
        if (step.compareTo(new BigDecimal("0.01")) <= 0) {
            return amount.setScale(2, RoundingMode.HALF_UP);
        }
        int sign = amount.signum();
        BigDecimal cents = amount.abs().movePointRight(2).setScale(0, RoundingMode.HALF_UP);
        BigDecimal stepCents = step.movePointRight(2).setScale(0, RoundingMode.HALF_UP);
        if (stepCents.signum() <= 0) {
            return amount.setScale(2, RoundingMode.HALF_UP);
        }
        int remainder = cents.remainder(stepCents).intValue();
        int stepInt = stepCents.intValue();
        int delta = remainder == 0 ? 0 : remainder <= stepInt / 2 ? -remainder : stepInt - remainder;
        // Preserve classic AU 5c behaviour for the default increment.
        if (step.compareTo(FIVE_CENTS) == 0) {
            delta = remainder == 0 ? 0 : remainder <= 2 ? -remainder : 5 - remainder;
        }
        BigDecimal rounded = cents.add(BigDecimal.valueOf(delta)).movePointLeft(2).setScale(2, RoundingMode.UNNECESSARY);
        return sign < 0 ? rounded.negate() : rounded;
    }

    /** Signed difference applied to a cash settlement: rounded minus original. */
    public static BigDecimal difference(BigDecimal amount) {
        return difference(amount, FIVE_CENTS);
    }

    public static BigDecimal difference(BigDecimal amount, BigDecimal increment) {
        return roundTo(amount, increment).subtract(amount == null
                ? BigDecimal.ZERO.setScale(2, RoundingMode.UNNECESSARY)
                : amount.setScale(2, RoundingMode.HALF_UP));
    }
}
