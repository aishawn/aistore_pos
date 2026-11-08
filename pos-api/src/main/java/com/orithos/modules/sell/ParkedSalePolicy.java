package com.orithos.modules.sell;

import com.orithos.common.AustraliaTime;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;

/**
 * Parked sales stay for the business day they were parked and the next one.
 * The next day they are marked overdue; after that they are voided.
 */
public final class ParkedSalePolicy {

    /** How many previous outlet business days to keep before auto-void. */
    public static final int KEEP_PREVIOUS_DAYS = 1;

    private ParkedSalePolicy() {
    }

    /** Business dates strictly before this value are voided. */
    public static LocalDate expireBefore(LocalDate today) {
        return today.minusDays(KEEP_PREVIOUS_DAYS);
    }

    /** UTC wall-clock cutoff matching {@link #expireBefore(LocalDate)} at outlet midnight. */
    public static LocalDateTime createdBeforeUtc(LocalDate today) {
        return expireBefore(today).atStartOfDay(AustraliaTime.ZONE)
                .withZoneSameInstant(ZoneOffset.UTC)
                .toLocalDateTime();
    }

    /** Previous business day, still inside the keep window. */
    public static boolean stale(LocalDate businessDate, LocalDate today) {
        if (businessDate == null || today == null) return false;
        return businessDate.isBefore(today) && !businessDate.isBefore(expireBefore(today));
    }

    /** Business date on which this parked sale is voided (start of that day). */
    public static LocalDate clearsOn(LocalDate businessDate) {
        if (businessDate == null) return null;
        return businessDate.plusDays(KEEP_PREVIOUS_DAYS + 1L);
    }
}
