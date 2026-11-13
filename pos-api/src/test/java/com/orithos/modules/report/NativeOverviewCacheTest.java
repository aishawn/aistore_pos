package com.orithos.modules.report;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NativeOverviewCacheTest {

    @Test
    void cachesWithinTenantOutletAndPeriodAndReturnsIndependentPayloads() {
        JdbcTemplate jdbc = jdbc();
        ReportQueryService service = new ReportQueryService(jdbc, Clock.systemUTC(), Duration.ofSeconds(10));
        LocalDate from = LocalDate.of(2026, 11, 12);
        LocalDate to = LocalDate.of(2026, 11, 12);

        Map<String, Object> first = service.nativeOverview(55L, 87L, from, to);
        first.put("revenue", new BigDecimal("999.00"));
        assertEquals(new BigDecimal("0.00"), service.nativeOverview(55L, 87L, from, to).get("revenue"));

        service.nativeOverview(56L, 87L, from, to);
        service.nativeOverview(55L, 88L, from, to);
        service.nativeOverview(55L, 87L, from.minusDays(1), to);

        verify(jdbc, times(8)).queryForList(anyString(), any(Object[].class));
        verify(jdbc, times(4)).queryForMap(anyString(), any(Object[].class));
        verify(jdbc, times(5)).queryForObject(anyString(), eq(Integer.class), anyLong(), anyLong());
    }

    @Test
    void rerunsOverviewAfterCacheTtlExpires() {
        JdbcTemplate jdbc = jdbc();
        MutableClock clock = new MutableClock(Instant.parse("2026-11-12T00:00:00Z"));
        ReportQueryService service = new ReportQueryService(jdbc, clock, Duration.ofSeconds(5));
        LocalDate day = LocalDate.of(2026, 11, 12);

        service.nativeOverview(55L, 87L, day, day);
        clock.advance(Duration.ofSeconds(5));
        service.nativeOverview(55L, 87L, day, day);

        verify(jdbc, times(4)).queryForList(anyString(), any(Object[].class));
        verify(jdbc, times(2)).queryForMap(anyString(), any(Object[].class));
    }

    @Test
    void nativeSalesOverviewMatchesFullReportMetricsWithoutProductOrInventoryQueries() {
        LocalDate from = LocalDate.of(2026, 11, 12);
        LocalDate to = LocalDate.of(2026, 11, 13);
        Map<String, Object> dailyRow = new java.util.LinkedHashMap<>();
        dailyRow.put("date", from);
        dailyRow.put("revenue", new BigDecimal("100.00"));
        dailyRow.put("sales_amount", new BigDecimal("105.00"));
        dailyRow.put("refund_amount", new BigDecimal("5.00"));
        dailyRow.put("tax", new BigDecimal("9.09"));
        dailyRow.put("discount", BigDecimal.ZERO);
        dailyRow.put("transaction_count", 2);
        dailyRow.put("refund_transaction_count", 1);
        dailyRow.put("tax_missing_count", 0);
        dailyRow.put("cost_missing_count", 0);
        dailyRow.put("cost", new BigDecimal("40.00"));
        dailyRow.put("data_as_of", java.sql.Timestamp.from(Instant.parse("2026-11-12T10:00:00Z")));

        JdbcTemplate salesJdbc = jdbc();
        when(salesJdbc.queryForList(anyString(), any(Object[].class))).thenReturn(java.util.List.of(dailyRow));
        Map<String, Object> sales = new ReportQueryService(salesJdbc, Clock.systemUTC(), Duration.ofSeconds(10))
                .nativeSalesOverview(55L, 87L, from, to);

        JdbcTemplate overviewJdbc = jdbc();
        when(overviewJdbc.queryForList(anyString(), any(Object[].class))).thenReturn(java.util.List.of(dailyRow));
        Map<String, Object> overview = new ReportQueryService(overviewJdbc, Clock.systemUTC(), Duration.ofSeconds(10))
                .nativeOverview(55L, 87L, from, to);

        for (String metric : java.util.List.of("revenue", "grossProfit", "costAvailable", "transactions", "dataAsOf",
                "grossSales", "refunds", "tax", "reportDataStatus", "reportPeriodFrom", "reportPeriodTo",
                "reportTimeZone")) {
            assertEquals(overview.get(metric), sales.get(metric), metric);
        }
        verify(salesJdbc, times(1)).queryForList(anyString(), any(Object[].class));
        verify(salesJdbc, never()).queryForMap(anyString(), any(Object[].class));
        verify(salesJdbc, times(1)).queryForObject(anyString(), eq(Integer.class), anyLong(), anyLong());
    }

    private static JdbcTemplate jdbc() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), eq(Integer.class), anyLong(), anyLong())).thenReturn(1);
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(java.util.List.of());
        when(jdbc.queryForMap(anyString(), any(Object[].class))).thenReturn(Map.of(
                "sku_count", 0, "positive_skus", 0, "negative_skus", 0,
                "positive_units", BigDecimal.ZERO, "case_level_total", BigDecimal.ZERO,
                "item_level_total", BigDecimal.ZERO));
        return jdbc;
    }

    private static final class MutableClock extends Clock {
        private final AtomicReference<Instant> current;

        private MutableClock(Instant initial) {
            current = new AtomicReference<>(initial);
        }

        @Override
        public ZoneId getZone() {
            return ZoneId.of("UTC");
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return current.get();
        }

        private void advance(Duration duration) {
            current.updateAndGet(value -> value.plus(duration));
        }
    }
}
