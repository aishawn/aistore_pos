package com.orithos.common;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AustraliaTimeTest {

    @Test
    void usesMelbourneCivilTimeAndBusinessDateAcrossMidnight() {
        Instant instant = Instant.parse("2026-06-01T14:35:00Z");

        assertEquals(ZoneId.of("Australia/Melbourne"), AustraliaTime.ZONE);
        assertEquals(LocalDate.of(2026, 6, 2), AustraliaTime.businessDate(instant));
        assertEquals(LocalDateTime.of(2026, 6, 2, 0, 35),
                AustraliaTime.fromUtcWall(LocalDateTime.of(2026, 6, 1, 14, 35)).toLocalDateTime());
    }

    @Test
    void appliesMelbourneDaylightSavingRules() {
        Instant summerInstant = Instant.parse("2026-01-01T13:00:00Z");
        Instant winterInstant = Instant.parse("2026-07-01T14:00:00Z");

        assertEquals(10 * 60 * 60, AustraliaTime.ZONE.getRules().getOffset(winterInstant).getTotalSeconds());
        assertEquals(11 * 60 * 60, AustraliaTime.ZONE.getRules().getOffset(summerInstant).getTotalSeconds());
    }
}
