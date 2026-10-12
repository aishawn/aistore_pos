package com.orithos.modules.report;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;

class DailySalesReportTest {

    @Test
    void computesGrossProfitAndMargin() {
        DailySalesReport row = DailySalesReport.of(
                LocalDate.of(2026, 8, 31),
                new BigDecimal("200.00"),
                new BigDecimal("80.00"),
                4);
        assertEquals(new BigDecimal("120.00"), row.grossProfit());
        assertEquals(new BigDecimal("60.00"), row.grossProfitMargin());
        assertEquals(4, row.transactionCount());
    }

    @Test
    void zeroSalesYieldsZeroMargin() {
        DailySalesReport row = DailySalesReport.of(
                LocalDate.of(2026, 8, 31),
                BigDecimal.ZERO,
                new BigDecimal("10.00"),
                0);
        assertEquals(new BigDecimal("-10.00"), row.grossProfit());
        assertEquals(new BigDecimal("0.00"), row.grossProfitMargin());
    }

    @Test
    void weekThroughTodayIncludesTodayAndExcludesFuture() {
        var monday = ReportQueryService.weekThroughToday(LocalDate.of(2026, 8, 31));
        assertEquals(1, monday.size());
        assertEquals(LocalDate.of(2026, 8, 31), monday.get(0).date());

        var wednesday = ReportQueryService.weekThroughToday(LocalDate.of(2026, 9, 2));
        assertEquals(3, wednesday.size());
        assertEquals(LocalDate.of(2026, 8, 31), wednesday.get(0).date());
        assertEquals(LocalDate.of(2026, 9, 2), wednesday.get(2).date());
    }

    @Test
    void lastWeekEmptyIsSingleAggregateWithoutDate() {
        var empty = ReportQueryService.lastWeekEmpty();
        assertEquals(null, empty.date());
        assertEquals(0, empty.transactionCount());
        assertEquals(new BigDecimal("0.00"), empty.totalSales());
    }

    @Test
    void lastMonthEmptyIsSingleAggregateWithoutDate() {
        var empty = ReportQueryService.lastMonthEmpty();
        assertEquals(null, empty.date());
        assertEquals(0, empty.transactionCount());
        assertEquals(new BigDecimal("0.00"), empty.totalSales());
    }

    @Test
    void thisMonthThroughTodayStartsOnFirstAndExcludesFuture() {
        var endOfAugust = ReportQueryService.thisMonthThroughToday(LocalDate.of(2026, 8, 31));
        assertEquals(31, endOfAugust.size());
        assertEquals(LocalDate.of(2026, 8, 1), endOfAugust.get(0).date());
        assertEquals(LocalDate.of(2026, 8, 31), endOfAugust.get(30).date());

        var earlySeptember = ReportQueryService.thisMonthThroughToday(LocalDate.of(2026, 9, 2));
        assertEquals(2, earlySeptember.size());
        assertEquals(LocalDate.of(2026, 9, 1), earlySeptember.get(0).date());
        assertEquals(LocalDate.of(2026, 9, 2), earlySeptember.get(1).date());
    }
}
