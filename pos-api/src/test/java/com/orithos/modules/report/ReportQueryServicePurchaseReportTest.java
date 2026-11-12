package com.orithos.modules.report;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class ReportQueryServicePurchaseReportTest {

    @Test
    void normalizePurchaseGroupByDefaultsToOutlet() {
        assertEquals("outlet", ReportQueryService.normalizePurchaseGroupBy(null));
        assertEquals("outlet", ReportQueryService.normalizePurchaseGroupBy(" "));
        assertEquals("supplier", ReportQueryService.normalizePurchaseGroupBy("Supplier"));
        assertEquals("none", ReportQueryService.normalizePurchaseGroupBy("none"));
        assertEquals("outlet", ReportQueryService.normalizePurchaseGroupBy("weird"));
    }

    @Test
    void nativePurchaseReportAggregatesOutletRowsAndMarksUnavailableMoneyNull() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        doReturn(1).when(jdbc).queryForObject(anyString(), eq(Integer.class), anyLong(), anyLong());
        doReturn(List.of(Map.of(
                "group_id", 87L,
                "name", "Cellarbrations at St Kilda Road",
                "order_count", 3,
                "total_cost", new BigDecimal("8576.94"),
                "fees_sum", BigDecimal.ZERO,
                "fees_present", 0,
                "freight_sum", BigDecimal.ZERO,
                "freight_present", 0
        ))).when(jdbc).queryForList(anyString(), any(Object.class), any(Object.class), any(Object.class));
        doReturn(3L, 2L).when(jdbc).queryForObject(anyString(), eq(Long.class), any(Object[].class));

        ReportQueryService service = new ReportQueryService(jdbc);
        Map<String, Object> report = service.nativePurchaseReport(
                55L, 87L, LocalDate.of(2026, 11, 12), LocalDate.of(2026, 11, 12), "outlet");

        assertEquals("orithos_ledger", report.get("source"));
        assertEquals("outlet", report.get("groupBy"));
        assertFalse((Boolean) report.get("feesAvailable"));
        assertFalse((Boolean) report.get("taxAvailable"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) report.get("rows");
        assertEquals(1, rows.size());
        assertEquals("Cellarbrations at St Kilda Road", rows.get(0).get("name"));
        assertEquals(new BigDecimal("8576.94"), rows.get(0).get("totalCost"));
        assertNull(rows.get(0).get("fees"));
        assertNull(rows.get(0).get("taxAmount"));
        @SuppressWarnings("unchecked")
        Map<String, Object> totals = (Map<String, Object>) report.get("totals");
        assertEquals(3L, totals.get("orderCount"));
        assertEquals(new BigDecimal("8576.94"), totals.get("totalCost"));

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc).queryForList(sql.capture(), any(Object.class), any(Object.class), any(Object.class));
        String query = sql.getValue();
        assertTrue(query.contains("po.status IN ('RECEIVED', 'PARTIALLY_RECEIVED')"));
        assertTrue(query.contains("po.type = 'ORDER'"));
        assertFalse(query.contains("status = 'OPEN'"));
        assertFalse(query.contains("status = 'CANCELLED'"));

        ArgumentCaptor<String> diagnosticsSql = ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(jdbc, org.mockito.Mockito.times(2))
                .queryForObject(diagnosticsSql.capture(), eq(Long.class), any(Object[].class));
        assertTrue(diagnosticsSql.getAllValues().stream().allMatch(value -> value.contains("purchase_order")));
        assertTrue(diagnosticsSql.getAllValues().stream().noneMatch(value -> value.contains("shopfront_")));
    }

    @Test
    void nativePurchaseReportEmptyWindowReturnsZeroTotals() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        doReturn(1).when(jdbc).queryForObject(anyString(), eq(Integer.class), anyLong(), anyLong());
        doReturn(List.of()).when(jdbc).queryForList(anyString(), any(Object.class), any(Object.class), any(Object.class));

        ReportQueryService service = new ReportQueryService(jdbc);
        Map<String, Object> report = service.nativePurchaseReport(
                55L, 87L, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 2), "none");

        assertEquals("none", report.get("groupBy"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) report.get("rows");
        assertTrue(rows.isEmpty());
        @SuppressWarnings("unchecked")
        Map<String, Object> totals = (Map<String, Object>) report.get("totals");
        assertEquals(0L, totals.get("orderCount"));
        assertEquals(new BigDecimal("0.00"), totals.get("totalCost"));
    }
}
