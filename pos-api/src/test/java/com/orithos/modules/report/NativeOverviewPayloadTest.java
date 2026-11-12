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
    void computesShopfrontStyleProfitAsRevenueMinusCost() {
        Map<String, Object> day = new LinkedHashMap<>();
        day.put("date", LocalDate.of(2026, 11, 9));
        day.put("revenue", new BigDecimal("110.00"));
        day.put("tax", new BigDecimal("10.00"));
        day.put("cost", new BigDecimal("60.00"));
        day.put("discount", new BigDecimal("5.00"));
        day.put("transaction_count", 1);
        day.put("cost_missing_count", 0);
        day.put("tax_missing_count", 0);

        Map<String, Object> result = ReportQueryService.nativeOverviewPayload(
                LocalDate.of(2026, 11, 9), LocalDate.of(2026, 11, 9), List.of(day), List.of());

        assertEquals(new BigDecimal("50.00"), result.get("grossProfit"));
        assertEquals(new BigDecimal("100.00"), result.get("netRevenue"));
        assertEquals(new BigDecimal("5.00"), result.get("discount"));
        assertEquals(new BigDecimal("45.45"), result.get("profitMargin"));
        assertEquals(new BigDecimal("110.00"), result.get("averageSale"));
    }

    @Test
    void averageSaleUsesSalesOnlyAndKeepsRefundsSeparate() {
        Map<String, Object> day = new LinkedHashMap<>();
        day.put("date", LocalDate.of(2026, 11, 12));
        day.put("revenue", new BigDecimal("5173.94"));
        day.put("sales_amount", new BigDecimal("5178.94"));
        day.put("refund_amount", new BigDecimal("5.00"));
        day.put("tax", new BigDecimal("423.82"));
        day.put("cost", new BigDecimal("3188.66"));
        day.put("discount", BigDecimal.ZERO);
        day.put("transaction_count", 185);
        day.put("refund_transaction_count", 1);
        day.put("cost_missing_count", 0);
        day.put("tax_missing_count", 0);

        Map<String, Object> result = ReportQueryService.nativeOverviewPayload(
                LocalDate.of(2026, 11, 12), LocalDate.of(2026, 11, 12), List.of(day), List.of());

        assertEquals(new BigDecimal("5173.94"), result.get("revenue"));
        assertEquals(new BigDecimal("5178.94"), result.get("grossSales"));
        assertEquals(new BigDecimal("5.00"), result.get("refunds"));
        assertEquals(185L, result.get("transactions"));
        assertEquals(1L, result.get("refundTransactions"));
        assertEquals(new BigDecimal("27.99"), result.get("averageSale"));
    }

    @Test
    void includesPositiveInventoryUnitsWhenSnapshotIsPresent() {
        Map<String, Object> inventory = new LinkedHashMap<>();
        inventory.put("sku_count", 10);
        inventory.put("positive_skus", 8);
        inventory.put("negative_skus", 2);
        inventory.put("positive_units", new BigDecimal("49748.4"));
        inventory.put("case_level_total", new BigDecimal("2970"));
        inventory.put("item_level_total", new BigDecimal("15645"));

        Map<String, Object> result = ReportQueryService.nativeOverviewPayload(
                LocalDate.of(2026, 11, 9), LocalDate.of(2026, 11, 9), List.of(), List.of(), inventory);

        assertEquals(true, result.get("inventoryAvailable"));
        assertEquals(49748L, result.get("inventoryUnits"));
        assertEquals(2970L, result.get("inventoryCaseLevel"));
        assertEquals(15645L, result.get("inventoryItemLevel"));
        assertEquals(2L, result.get("negativeStockProducts"));
        assertEquals("negative_stock", result.get("inventoryStatus"));
    }
}
