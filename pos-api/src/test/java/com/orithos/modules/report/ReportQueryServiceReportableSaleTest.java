package com.orithos.modules.report;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class ReportQueryServiceReportableSaleTest {

    @Test
    void reportableSaleIncludesCompletedAndIncompleteOnly() {
        assertTrue(ReportQueryService.isReportableSale("COMPLETED", null));
        assertTrue(ReportQueryService.isReportableSale("COMPLETED", "shopfront"));
        assertTrue(ReportQueryService.isReportableSale("INCOMPLETE", "shopfront"));
        assertTrue(ReportQueryService.isReportableSale("incomplete", null));

        assertFalse(ReportQueryService.isReportableSale("PARKED", "shopfront"));
        assertFalse(ReportQueryService.isReportableSale("PARKED", null));
        assertFalse(ReportQueryService.isReportableSale("VOIDED", "shopfront"));
        assertFalse(ReportQueryService.isReportableSale(null, "shopfront"));
    }

    @Test
    void dailySalesSqlUsesShopfrontParityPredicate() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        doReturn(List.of(Map.of(
                "total_sales", 5038.48,
                "transaction_count", 162,
                "cost", 3620.12
        ))).when(jdbc).queryForList(anyString(), any(Object.class), any(Object.class));
        ReportQueryService service = new ReportQueryService(jdbc);

        service.dailySales(87L, LocalDate.of(2026, 11, 9));

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc).queryForList(sql.capture(), any(Object.class), any(Object.class));
        String query = sql.getValue();
        assertTrue(query.contains(ReportQueryService.REPORTABLE_SALE_STATUS_SQL));
        assertTrue(query.contains("s.status = 'INCOMPLETE'"));
        assertTrue(query.contains("COALESCE(p.cost_percentage, 0) = 0"));
        assertFalse(query.contains("s.status = 'PARKED'"));
    }
}
