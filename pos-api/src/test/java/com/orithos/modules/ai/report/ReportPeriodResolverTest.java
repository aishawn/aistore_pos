package com.orithos.modules.ai.report;

import com.orithos.common.AustraliaTime;
import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.Month;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ReportPeriodResolverTest {

    private final ReportPeriodResolver resolver = new ReportPeriodResolver();

    @Test
    void lastFridayIsSingleFridayBeforeToday() {
        ReportPeriodResolver.Window w = resolver.resolve(Map.of(), "上周五啤酒类卖了多少");
        assertEquals(DayOfWeek.FRIDAY, w.from().getDayOfWeek());
        assertEquals(1, w.days());
        assertEquals(w.from().plusDays(1), w.toExclusive());
        assertTrue(w.from().toLocalDate().isBefore(AustraliaTime.today()));
    }

    @Test
    void lastFridayEnglish() {
        ReportPeriodResolver.Window w = resolver.resolve(Map.of(), "beer sales last friday");
        assertEquals(DayOfWeek.FRIDAY, w.from().getDayOfWeek());
        assertEquals(1, w.days());
    }

    @Test
    void lastFridayWinsOverLastWeekSubstring() {
        ReportPeriodResolver.Window lastWeek = resolver.resolve(Map.of(), "上周销售额");
        ReportPeriodResolver.Window lastFriday = resolver.resolve(Map.of(), "上周五");
        assertEquals(7, lastWeek.days());
        assertEquals(1, lastFriday.days());
        assertEquals(DayOfWeek.FRIDAY, lastFriday.from().getDayOfWeek());
    }

    @Test
    void todayInQuestionBeatsWrongSlotDates() {
        ReportPeriodResolver.Window w = resolver.resolve(
                Map.of("from", "2020-01-01", "to", "2020-01-01", "days", "8"), "今天销量");
        assertEquals(AustraliaTime.today(), w.from().toLocalDate());
        assertEquals(AustraliaTime.today().plusDays(1), w.toExclusive().toLocalDate());
        assertEquals(1, w.days());
    }

    @Test
    void dayMonthQuestionUsesCurrentYearInsteadOfWrongModelYear() {
        LocalDate expected = LocalDate.of(AustraliaTime.today().getYear(), 10, 14);
        ReportPeriodResolver.Window w = resolver.resolve(
                Map.of("from", "2023-10-14", "to", "2023-10-14"), "14,oct sales");
        assertEquals(expected, w.from().toLocalDate());
        assertEquals(expected.plusDays(1), w.toExclusive().toLocalDate());
        assertEquals(1, w.days());
    }

    @Test
    void monthDayAndExplicitYearAreReadFromQuestion() {
        ReportPeriodResolver.Window currentYear = resolver.resolve(Map.of(), "sales on Oct 14");
        assertEquals(LocalDate.of(AustraliaTime.today().getYear(), 10, 14), currentYear.from().toLocalDate());

        ReportPeriodResolver.Window explicitYear = resolver.resolve(Map.of(), "sales on 14 October 2024");
        assertEquals(LocalDate.of(2024, 10, 14), explicitYear.from().toLocalDate());
    }

    @Test
    void lowerCaseEnglishMonthAbbreviationsResolveToTheCurrentYear() {
        int year = AustraliaTime.today().getYear();
        for (Month month : Month.values()) {
            String abbreviation = month.name().substring(0, 3).toLowerCase(Locale.ROOT);
            ReportPeriodResolver.Window window = resolver.resolve(Map.of(), "14," + abbreviation + " sales");
            assertEquals(LocalDate.of(year, month, 14), window.from().toLocalDate(), abbreviation);
        }
    }

    @Test
    void australianNumericDateIsDayFirstAndOverridesModelSlots() {
        ReportPeriodResolver.Window w = resolver.resolve(
                Map.of("from", "2023-10-14", "to", "2023-10-14"), "sales on 14/10/2025");
        assertEquals(LocalDate.of(2025, 10, 14), w.from().toLocalDate());
    }

    @Test
    void deadStockDefaultCanUseTrailingThirtyBusinessDays() {
        LocalDate today = AustraliaTime.today();
        ReportPeriodResolver.Window w = resolver.resolve(Map.of(), "dead stock", 30);
        assertEquals(today.minusDays(29), w.from().toLocalDate());
        assertEquals(today.plusDays(1), w.toExclusive().toLocalDate());
        assertEquals(30, w.days());
    }

    @Test
    void lastNdaysWindowContainsExactlyTheRequestedNumberOfBusinessDays() {
        LocalDate today = AustraliaTime.today();
        ReportPeriodResolver.Window w = resolver.resolve(Map.of(), "sales last 7 days");
        assertEquals(today.minusDays(6), w.from().toLocalDate());
        assertEquals(today.plusDays(1), w.toExclusive().toLocalDate());
        assertEquals(7, w.days());
    }

    @Test
    void zuoriIsYesterday() {
        ReportPeriodResolver.Window w = resolver.resolve(Map.of(), "昨日销量");
        assertEquals(AustraliaTime.today().minusDays(1), w.from().toLocalDate());
        assertEquals(AustraliaTime.today(), w.toExclusive().toLocalDate());
    }

    @Test
    void shangYiGeYueIsLastMonth() {
        LocalDate today = AustraliaTime.today();
        LocalDate first = today.minusMonths(1).withDayOfMonth(1);
        ReportPeriodResolver.Window w = resolver.resolve(Map.of(), "上一个月的销量");
        assertEquals(first, w.from().toLocalDate());
        assertEquals(first.plusMonths(1), w.toExclusive().toLocalDate());
    }

    @Test
    void shangYueAndPreviousMonthAliases() {
        LocalDate first = AustraliaTime.today().minusMonths(1).withDayOfMonth(1);
        for (String q : List.of("上月销售额", "前一个月销量", "previous month sales")) {
            ReportPeriodResolver.Window w = resolver.resolve(Map.of(), q);
            assertEquals(first, w.from().toLocalDate(), q);
            assertEquals(first.plusMonths(1), w.toExclusive().toLocalDate(), q);
        }
    }
}
