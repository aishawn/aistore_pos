package com.orithos.modules.product;

import com.orithos.common.BusinessException;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class CompetitorPriceCalculationTest {
    @Test
    void calculatesPackUnitPriceAndPricePerLitre() {
        assertEquals(new BigDecimal("4.0000"),
                CompetitorPriceController.calculateUnitPrice(new BigDecimal("24"), null, 6));
        assertEquals(new BigDecimal("40.0000"),
                CompetitorPriceController.calculateUnitPrice(new BigDecimal("60"), 750, 2));
    }

    @Test
    void convertsStoreWallTimeToUtcAndRejectsDstGapsOrOverlaps() {
        ZoneId adelaide = ZoneId.of("Australia/Adelaide");
        assertEquals(LocalDateTime.parse("2026-01-15T01:30:00"),
                CompetitorPriceController.toUtc(LocalDateTime.parse("2026-01-15T12:00:00"), adelaide));
        assertThrows(BusinessException.class, () -> CompetitorPriceController.toUtc(
                LocalDateTime.parse("2026-10-04T02:30:00"), adelaide));
        assertThrows(BusinessException.class, () -> CompetitorPriceController.toUtc(
                LocalDateTime.parse("2026-04-05T02:30:00"), adelaide));
    }
}
