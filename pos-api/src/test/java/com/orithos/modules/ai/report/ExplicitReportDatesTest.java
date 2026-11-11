package com.orithos.modules.ai.report;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ExplicitReportDatesTest {
    @Test
    void parsesTwoEnglishDatesWithAndWithoutYear() {
        assertEquals(List.of(LocalDate.of(2026, 10, 14), LocalDate.of(2026, 10, 15)),
                ExplicitReportDates.parsePair("Compare sales on 14 Oct 2026 with 15 Oct 2026").orElseThrow());
        assertEquals(List.of(LocalDate.of(2026, 10, 14), LocalDate.of(2026, 10, 15)),
                ExplicitReportDates.parsePair("Compare sales on 14 Oct with 15 Oct").orElseThrow());
    }

    @Test
    void parsesChineseAndAustralianDateForms() {
        assertEquals(List.of(LocalDate.of(2026, 10, 14), LocalDate.of(2026, 10, 15)),
                ExplicitReportDates.parsePair("比较2026年10月14日和2026年10月15日销售额").orElseThrow());
        assertEquals(List.of(LocalDate.of(2026, 10, 14), LocalDate.of(2026, 10, 15)),
                ExplicitReportDates.parsePair("Compare sales 14/10/2026 vs 15/10/2026").orElseThrow());
    }

    @Test
    void rejectsAmbiguousDuplicateMalformedAndExtraDates() {
        assertTrue(ExplicitReportDates.parsePair("Compare sales last week with this week").isEmpty());
        assertTrue(ExplicitReportDates.parsePair("Compare sales on 14 Oct with 14 Oct").isEmpty());
        assertTrue(ExplicitReportDates.parsePair("Compare sales on 31 Feb 2026 with 1 Mar 2026").isEmpty());
        assertTrue(ExplicitReportDates.parsePair("Compare sales on 14 Oct, 15 Oct and 16 Oct").isEmpty());
    }
}
