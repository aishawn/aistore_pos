package com.orithos.modules.ai.report;

import com.orithos.common.AustraliaTime;
import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;
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
                Map.of("from", "2020-01-01", "to", "2020-01-01"), "今天销量");
        assertEquals(AustraliaTime.today(), w.from().toLocalDate());
        assertEquals(AustraliaTime.today().plusDays(1), w.toExclusive().toLocalDate());
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
