package com.orithos.modules.sell;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ParkedSalePolicyTest {

    private final LocalDate today = LocalDate.of(2026, 9, 24);

    @Test
    void sameDayParkIsFresh() {
        LocalDate parkedOn = today;
        assertFalse(ParkedSalePolicy.stale(parkedOn, today));
        assertFalse(parkedOn.isBefore(ParkedSalePolicy.expireBefore(today)));
        assertEquals(LocalDate.of(2026, 9, 26), ParkedSalePolicy.clearsOn(parkedOn));
    }

    @Test
    void previousBusinessDayIsOverdueButKept() {
        LocalDate parkedOn = LocalDate.of(2026, 9, 23);
        assertTrue(ParkedSalePolicy.stale(parkedOn, today));
        assertFalse(parkedOn.isBefore(ParkedSalePolicy.expireBefore(today)));
        assertEquals(LocalDate.of(2026, 9, 25), ParkedSalePolicy.clearsOn(parkedOn));
    }

    @Test
    void olderThanPreviousDayIsExpired() {
        assertTrue(LocalDate.of(2026, 9, 22).isBefore(ParkedSalePolicy.expireBefore(today)));
        assertTrue(LocalDate.of(2026, 9, 18).isBefore(ParkedSalePolicy.expireBefore(today)));
        assertFalse(ParkedSalePolicy.stale(LocalDate.of(2026, 9, 18), today));
    }

    @Test
    void utcCutoffIsMelbourneMidnightOfTheExpireDate() {
        LocalDateTime cutoff = ParkedSalePolicy.createdBeforeUtc(today);
        assertEquals(LocalDateTime.of(2026, 9, 22, 14, 0), cutoff);
        assertEquals(LocalDate.of(2026, 9, 23),
                cutoff.atZone(ZoneOffset.UTC).withZoneSameInstant(com.orithos.common.AustraliaTime.ZONE).toLocalDate());
    }

    @Test
    void utcCutoffUsesTheConfiguredVendorTimezone() {
        LocalDateTime cutoff = ParkedSalePolicy.createdBeforeUtc(today, ZoneId.of("Australia/Adelaide"));
        assertEquals(LocalDateTime.of(2026, 9, 22, 14, 30), cutoff);

        LocalDateTime summerCutoff = ParkedSalePolicy.createdBeforeUtc(
                LocalDate.of(2026, 1, 10), ZoneId.of("Pacific/Auckland"));
        assertEquals(LocalDateTime.of(2026, 1, 8, 11, 0), summerCutoff);
    }
}
