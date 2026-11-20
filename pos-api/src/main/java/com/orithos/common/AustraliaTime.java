package com.orithos.common;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

/**
 * Civil clock for the current Orithos pilot stores in South Australia. The
 * zone rules cover Adelaide daylight-saving transitions and business dates.
 */
public final class AustraliaTime {

    public static final ZoneId ZONE = ZoneId.of("Australia/Melbourne");

    private AustraliaTime() {
    }

    public static LocalDate today() {
        return LocalDate.now(ZONE);
    }

    public static LocalDateTime localNow() {
        return LocalDateTime.now(ZONE);
    }

    /** Business date of an instant, using Adelaide ACST/ACDT rules. */
    public static LocalDate businessDate(Instant instant) {
        return instant.atZone(ZONE).toLocalDate();
    }

    /**
     * {@code utcWall} is a DATETIME stored as UTC (JDBC {@code serverTimezone=UTC}).
     * Returns the matching Australia/Melbourne civil date and wall time.
     */
    public static ZonedDateTime fromUtcWall(LocalDateTime utcWall) {
        return utcWall.atZone(java.time.ZoneOffset.UTC).withZoneSameInstant(ZONE);
    }
}
