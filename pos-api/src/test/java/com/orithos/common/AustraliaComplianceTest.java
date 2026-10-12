package com.orithos.common;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AustraliaComplianceTest {

    @Test
    void cashRoundsToNearestFiveCents() {
        assertEquals(new BigDecimal("4.55"), CashRounding.toNearestFiveCents(new BigDecimal("4.53")));
        assertEquals(new BigDecimal("4.50"), CashRounding.toNearestFiveCents(new BigDecimal("4.52")));
        assertEquals(new BigDecimal("4.50"), CashRounding.toNearestFiveCents(new BigDecimal("4.51")));
        assertEquals(new BigDecimal("4.55"), CashRounding.toNearestFiveCents(new BigDecimal("4.54")));
        assertEquals(new BigDecimal("4.55"), CashRounding.toNearestFiveCents(new BigDecimal("4.55")));
        assertEquals(new BigDecimal("4.55"), CashRounding.toNearestFiveCents(new BigDecimal("4.57")));
        assertEquals(new BigDecimal("4.60"), CashRounding.toNearestFiveCents(new BigDecimal("4.58")));
        assertEquals(new BigDecimal("0.02"), CashRounding.difference(new BigDecimal("4.53")));
    }

    @Test
    void gstIsExtractedFromInclusivePrice() {
        assertEquals(new BigDecimal("1.00"), GstMath.includedGst(new BigDecimal("11.00"), new BigDecimal("10")));
        assertEquals(new BigDecimal("0.41"), GstMath.includedGst(new BigDecimal("4.53"), GstMath.DEFAULT_RATE));
        assertEquals(new BigDecimal("0.00"), GstMath.includedGst(new BigDecimal("4.53"), BigDecimal.ZERO));
        assertEquals(new BigDecimal("10.00"), GstMath.exclusiveOfGst(new BigDecimal("11.00"), new BigDecimal("10")));
    }

    @Test
    void summerMidnightStaysOnTheAustralianBusinessDay() {
        // 13:30 UTC on 15 Jan is 00:30 AEDT on 16 Jan. A fixed +10 offset would
        // still call it 15 Jan and drop the sale from that day's takings.
        LocalDateTime utcWall = LocalDateTime.of(2026, 1, 15, 13, 30);
        LocalDate business = AustraliaTime.fromUtcWall(utcWall).toLocalDate();
        assertEquals(LocalDate.of(2026, 1, 16), business);
    }

    @Test
    void daylightSavingFallbackHourKeepsTheLocalDate() {
        // 15:30 UTC on 4 Apr 2026 is 02:30 AEDT on 5 Apr, before clocks fall back.
        LocalDate business = AustraliaTime.businessDate(
                LocalDateTime.of(2026, 4, 4, 15, 30).toInstant(ZoneOffset.UTC));
        assertEquals(LocalDate.of(2026, 4, 5), business);
    }

    @Test
    void liquorRequiresAbv() {
        assertTrue(LiquorProducts.isLiquor("Penfolds Bin 28 Shiraz", "Wine"));
        assertTrue(LiquorProducts.isLiquor("House Lager", "Beer"));
        assertFalse(LiquorProducts.isLiquor("Sparkling Mineral Water", "Soft Drink"));
        assertFalse(LiquorProducts.isLiquor("Potato Chips", "Snacks"));
        assertThrows(BusinessException.class, () -> LiquorProducts.requireAbv(null));
        LiquorProducts.requireAbv(new BigDecimal("14.5"));
        assertEquals(375, LiquorProducts.volumeMlFromName("Carlton Draught Btl 375ml"));
        assertEquals(1500, LiquorProducts.volumeMlFromName("Magnum 1.5L"));
        assertEquals("2021", LiquorProducts.normalizeVintage("2021"));
        assertEquals("NV", LiquorProducts.normalizeVintage("nv"));
        assertThrows(BusinessException.class, () -> LiquorProducts.normalizeVintage("21"));
    }
}
