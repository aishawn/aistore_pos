package com.orithos.modules.ai.report;

import com.orithos.common.AustraliaTime;
import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Month;
import java.time.ZoneId;
import java.time.ZoneOffset;
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
    void relativeTodayUsesTheBoundStoresTimezoneAtMidnight() {
        Clock clock = Clock.fixed(Instant.parse("2026-10-13T13:15:00Z"), ZoneOffset.UTC);
        ReportPeriodResolver boundaryResolver = new ReportPeriodResolver(clock);

        ReportPeriodResolver.Window adelaide = boundaryResolver.resolve(
                Map.of(), "today's sales", 1, ZoneId.of("Australia/Adelaide"));
        ReportPeriodResolver.Window sydney = boundaryResolver.resolve(
                Map.of(), "today's sales", 1, ZoneId.of("Australia/Sydney"));

        assertEquals(LocalDate.of(2026, 10, 13), adelaide.from().toLocalDate());
        assertEquals(LocalDate.of(2026, 10, 14), sydney.from().toLocalDate());
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

        for (String question : List.of(
                "How much did we sell on 16 Oct 2026?",
                "How much did the store sell on 16 October 2026?",
                "What did we sell on 16 October 2026?")) {
            ReportPeriodResolver.Window soldOnDate = resolver.resolve(Map.of(), question);
            assertEquals(LocalDate.of(2026, 10, 16), soldOnDate.from().toLocalDate(), question);
            assertEquals(LocalDate.of(2026, 10, 17), soldOnDate.toExclusive().toLocalDate(), question);
            assertEquals(1, soldOnDate.days(), question);
        }

        ReportPeriodResolver.Window chineseCurrentYear = resolver.resolve(
                Map.of("from", "2020-01-01", "to", "2020-01-01"), "10月14日销售额");
        assertEquals(LocalDate.of(AustraliaTime.today().getYear(), 10, 14), chineseCurrentYear.from().toLocalDate());

        ReportPeriodResolver.Window chineseExplicitYear = resolver.resolve(Map.of(), "查询2025年10月14号销售额");
        assertEquals(LocalDate.of(2025, 10, 14), chineseExplicitYear.from().toLocalDate());
    }

    @Test
    void lowerCaseAndFullMonthNamesAreCaseInsensitive() {
        int year = AustraliaTime.today().getYear();
        assertEquals(LocalDate.of(year, 10, 14),
                resolver.resolve(Map.of(), "sales on 14,oct").from().toLocalDate());
        assertEquals(LocalDate.of(year, 10, 14),
                resolver.resolve(Map.of(), "sales on 14 OCTOBER").from().toLocalDate());
    }

    @Test
    void invalidNamedDateFallsBackToSlotsInsteadOfThrowing() {
        ReportPeriodResolver.Window w = resolver.resolve(
                Map.of("from", "2026-10-14", "to", "2026-10-14"), "sales on 31 february");
        assertEquals(LocalDate.of(2026, 10, 14), w.from().toLocalDate());
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
    void datedSalesParaphrasesResolveToTheSameSingleBusinessDay() {
        ReportPeriodResolver fixedResolver = new ReportPeriodResolver(
                Clock.fixed(Instant.parse("2026-06-01T00:00:00Z"), ZoneOffset.UTC));
        LocalDate expected = LocalDate.of(2026, 10, 16);
        for (String question : List.of(
                "16 Oct 2026 sales",
                "How much did we take on 16 Oct 2026?",
                "What did we take on 16 October 2026?",
                "What did we make on 16 October 2026?",
                "How were sales on 16 October 2026?",
                "16/10/2026 revenue",
                "What were our takings on 16/10/2026?",
                "收入多少：2026年10月16日",
                "10月16日营业额")) {
            ReportPeriodResolver.Window window = fixedResolver.resolve(
                    Map.of("from", "2020-01-01", "to", "2020-01-02"), question);
            assertEquals(expected, window.from().toLocalDate(), question);
            assertEquals(expected.plusDays(1), window.toExclusive().toLocalDate(), question);
            assertEquals(1, window.days(), question);
        }

        LocalDate currentYearDate = LocalDate.of(2026, 10, 16);
        ReportPeriodResolver.Window implicitYear = fixedResolver.resolve(Map.of(), "10月16日卖了多少钱");
        assertEquals(currentYearDate, implicitYear.from().toLocalDate());
        assertEquals(currentYearDate.plusDays(1), implicitYear.toExclusive().toLocalDate());
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
    void supportsPastAndRecentEnglishAliases() {
        LocalDate today = AustraliaTime.today();
        for (String question : List.of("sales past 7 days", "sales previous 7 days", "最近7天销售额", "过去 7 天销量")) {
            ReportPeriodResolver.Window w = resolver.resolve(Map.of(), question);
            assertEquals(today.minusDays(6), w.from().toLocalDate(), question);
            assertEquals(today.plusDays(1), w.toExclusive().toLocalDate(), question);
            assertEquals(7, w.days(), question);
        }
    }

    @Test
    void supportsDayBeforeYesterdayAliases() {
        LocalDate date = AustraliaTime.today().minusDays(2);
        for (String question : List.of("前天销售额", "day before yesterday sales")) {
            ReportPeriodResolver.Window w = resolver.resolve(Map.of(), question);
            assertEquals(date, w.from().toLocalDate(), question);
            assertEquals(date.plusDays(1), w.toExclusive().toLocalDate(), question);
        }
    }

    @Test
    void supportsExplicitDateRanges() {
        ReportPeriodResolver.Window english = resolver.resolve(Map.of(), "sales from 14 Oct 2026 to 16 Oct 2026");
        assertEquals(LocalDate.of(2026, 10, 14), english.from().toLocalDate());
        assertEquals(LocalDate.of(2026, 10, 17), english.toExclusive().toLocalDate());
        assertEquals(3, english.days());

        ReportPeriodResolver.Window numeric = resolver.resolve(Map.of(), "销售额从 14/10/2026 到 16/10/2026");
        assertEquals(LocalDate.of(2026, 10, 14), numeric.from().toLocalDate());
        assertEquals(LocalDate.of(2026, 10, 17), numeric.toExclusive().toLocalDate());

        ReportPeriodResolver.Window monthDay = resolver.resolve(Map.of(), "sales from Oct 14 to Oct 16");
        assertEquals(LocalDate.of(2026, 10, 14), monthDay.from().toLocalDate());
        assertEquals(LocalDate.of(2026, 10, 17), monthDay.toExclusive().toLocalDate());

        ReportPeriodResolver.Window chinese = resolver.resolve(Map.of(), "销售额从10月14日到10月16日");
        assertEquals(LocalDate.of(2026, 10, 14), chinese.from().toLocalDate());
        assertEquals(LocalDate.of(2026, 10, 17), chinese.toExclusive().toLocalDate());
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
