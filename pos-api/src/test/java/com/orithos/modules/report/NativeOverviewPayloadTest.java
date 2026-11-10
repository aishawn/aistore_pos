package com.orithos.modules.report;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class NativeOverviewPayloadTest {

    @Test
    void withholdsProfitWhenCostOrTaxCoverageIsIncomplete() {
        Map<String, Object> day = new LinkedHashMap<>();
        day.put("date", LocalDate.of(2026, 11, 9));
        day.put("revenue", new BigDecimal("100.00"));
        day.put("tax", new BigDecimal("9.09"));
        day.put("cost", new BigDecimal("40.00"));
        day.put("transaction_count", 2);
        day.put("cost_missing_count", 1);
        day.put("tax_missing_count", 0);

        Map<String, Object> result = ReportQueryService.nativeOverviewPayload(
                LocalDate.of(2026, 11, 9), LocalDate.of(2026, 11, 9), List.of(day), List.of());

        assertEquals(false, result.get("costAvailable"));
        assertEquals(true, result.get("taxAvailable"));
        assertNull(result.get("cost"));
        assertNull(result.get("grossProfit"));
        @SuppressWarnings("unchecked")
        Map<String, Object> trend = ((List<Map<String, Object>>) result.get("dailyTrend")).getFirst();
        assertNull(trend.get("grossProfit"));
    }

    @Test
    void computesGrossProfitFromExTaxRevenueOnlyWhenCoverageIsComplete() {
        Map<String, Object> day = new LinkedHashMap<>();
        day.put("date", LocalDate.of(2026, 11, 9));
        day.put("revenue", new BigDecimal("110.00"));
        day.put("tax", new BigDecimal("10.00"));
        day.put("cost", new BigDecimal("60.00"));
        day.put("transaction_count", 1);
        day.put("cost_missing_count", 0);
        day.put("tax_missing_count", 0);

        Map<String, Object> result = ReportQueryService.nativeOverviewPayload(
                LocalDate.of(2026, 11, 9), LocalDate.of(2026, 11, 9), List.of(day), List.of());

        assertEquals(new BigDecimal("40.00"), result.get("grossProfit"));
        assertEquals(new BigDecimal("100.00"), result.get("netRevenue"));
    }
}
