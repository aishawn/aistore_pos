package com.orithos.modules.report;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.sql.Date;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class ReportQueryServiceSalesHistoryTaxTest {
    private static final LocalDate DAY = LocalDate.of(2026, 11, 12);

    @Test
    void queriesCompleteLineTaxBeforeFallingBackToSaleHeaderTax() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        doReturn(1).when(jdbc).queryForObject(anyString(), eq(Integer.class), anyLong(), anyLong());
        doReturn(List.of(Map.of(
                "date", Date.valueOf(DAY), "sales_transactions", 1, "refund_transactions", 0,
                "sales_amount", new BigDecimal("11.00"), "refund_amount", BigDecimal.ZERO,
                "net_sales", new BigDecimal("11.00"), "tax", new BigDecimal("1.00"), "tax_missing_count", 0
        ))).when(jdbc).queryForList(anyString(), any(Object.class), any(Object.class), any(Object.class));

        Map<String, Object> report = new ReportQueryService(jdbc).nativeSalesHistory(
                55L, 87L, DAY, DAY);

        @SuppressWarnings("unchecked")
        Map<String, Object> row = ((List<Map<String, Object>>) report.get("days")).getFirst();
        assertEquals(true, row.get("taxAvailable"));
        assertEquals(new BigDecimal("1.00"), row.get("tax"));
        verify(jdbc).queryForList(org.mockito.ArgumentMatchers.contains(
                        "line.item_count > 0 AND line.tax_missing_count = 0"),
                any(Object.class), any(Object.class), any(Object.class));
    }

    @Test
    void doesNotReportMissingLineTaxAsZero() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        doReturn(1).when(jdbc).queryForObject(anyString(), eq(Integer.class), anyLong(), anyLong());
        doReturn(List.of(Map.of(
                "date", Date.valueOf(DAY), "sales_transactions", 1, "refund_transactions", 0,
                "sales_amount", new BigDecimal("11.00"), "refund_amount", BigDecimal.ZERO,
                "net_sales", new BigDecimal("11.00"), "tax", BigDecimal.ZERO, "tax_missing_count", 1
        ))).when(jdbc).queryForList(anyString(), any(Object.class), any(Object.class), any(Object.class));

        Map<String, Object> report = new ReportQueryService(jdbc).nativeSalesHistory(
                55L, 87L, DAY, DAY);

        @SuppressWarnings("unchecked")
        Map<String, Object> row = ((List<Map<String, Object>>) report.get("days")).getFirst();
        assertEquals(false, row.get("taxAvailable"));
        assertNull(row.get("tax"));
    }

    @Test
    void doesNotTreatSalesWithoutVerifiableItemsAsZeroTax() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        doReturn(1).when(jdbc).queryForObject(anyString(), eq(Integer.class), anyLong(), anyLong());
        doReturn(List.of(Map.of(
                "date", Date.valueOf(DAY), "sales_transactions", 1, "refund_transactions", 0,
                "sales_amount", new BigDecimal("11.00"), "refund_amount", BigDecimal.ZERO,
                "net_sales", new BigDecimal("11.00"), "tax", BigDecimal.ZERO, "tax_missing_count", 1
        ))).when(jdbc).queryForList(anyString(), any(Object.class), any(Object.class), any(Object.class));

        Map<String, Object> report = new ReportQueryService(jdbc).nativeSalesHistory(
                55L, 87L, DAY, DAY);

        @SuppressWarnings("unchecked")
        Map<String, Object> row = ((List<Map<String, Object>>) report.get("days")).getFirst();
        assertEquals(false, row.get("taxAvailable"));
        assertNull(row.get("tax"));
    }
}
