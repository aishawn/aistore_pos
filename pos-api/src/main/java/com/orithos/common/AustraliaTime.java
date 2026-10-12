package com.orithos.common;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

/**
 * Civil clock for Australian stores. Australia/Sydney observes AEST (UTC+10)
 * and AEDT (UTC+11); the zone rules cover the daylight-saving transition so a
 * sale just after midnight stays on the store's business day.
 */
public final class AustraliaTime {

    public static final ZoneId ZONE = ZoneId.of("Australia/Sydney");

    private AustraliaTime() {
    }

    public static LocalDate today() {
        return LocalDate.now(ZONE);
    }

    public static LocalDateTime localNow() {
        return LocalDateTime.now(ZONE);
    }

    /** Business date of an instant, using Sydney AEST/AEDT rules. */
    public static LocalDate businessDate(Instant instant) {
        return instant.atZone(ZONE).toLocalDate();
    }

    /**
     * {@code utcWall} is a DATETIME stored as UTC (JDBC {@code serverTimezone=UTC}).
     * Returns the matching Australia/Sydney civil date and wall time.
     */
    public static ZonedDateTime fromUtcWall(LocalDateTime utcWall) {
        return utcWall.atZone(java.time.ZoneOffset.UTC).withZoneSameInstant(ZONE);
    }
}
