package com.orithos.modules.report;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class PurchaseReportSnapshotServiceTest {
    @Test
    void aggregatesImportedOrithosSnapshotsAndPreservesSourceChargeValues() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(any(String.class), eq(Integer.class), eq(87L), eq(55L))).thenReturn(1);
        when(jdbc.queryForList(any(String.class), eq(87L), eq("2026-11-12"), eq("2026-11-12"), eq("outlet")))
                .thenReturn(List.of(Map.of(
                        "business_date", Date.valueOf("2026-11-12"),
                        "rows_json", "[{\"Name\":\"Cellarbrations at St Kilda Road\",\"Orders\":6,\"Total Cost\":\"$8,576.94\",\"Fees\":\"$4.95\",\"Freight\":\"$0.00\",\"Payment Fees\":\"$0.00\",\"Tax Amount\":\"$785.29\"}]",
                        "fetched_at", Timestamp.from(Instant.parse("2026-11-12T23:52:50Z"))
                )));

        Map<String, Object> report = new PurchaseReportSnapshotService(jdbc, new ObjectMapper()).purchaseReport(
                55L, 87L, LocalDate.of(2026, 11, 12), LocalDate.of(2026, 11, 12), "outlet");

        assertEquals("orithos_ledger", report.get("source"));
        @SuppressWarnings("unchecked")
        Map<String, Object> totals = (Map<String, Object>) report.get("totals");
        assertEquals(6L, totals.get("orderCount"));
        assertEquals(new BigDecimal("8576.94"), totals.get("totalCost"));
        assertEquals(new BigDecimal("4.95"), totals.get("fees"));
        assertEquals(new BigDecimal("0.00"), totals.get("freight"));
        assertEquals(new BigDecimal("0.00"), totals.get("paymentFees"));
        assertEquals(new BigDecimal("785.29"), totals.get("taxAmount"));
    }

    @Test
    void reportsDatesWithoutAnImportedSnapshot() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(any(String.class), eq(Integer.class), eq(87L), eq(55L))).thenReturn(1);
        when(jdbc.queryForList(any(String.class), eq(87L), eq("2026-11-12"), eq("2026-11-13"), eq("outlet")))
                .thenReturn(List.of());

        Map<String, Object> report = new PurchaseReportSnapshotService(jdbc, new ObjectMapper()).purchaseReport(
                55L, 87L, LocalDate.of(2026, 11, 12), LocalDate.of(2026, 11, 13), "outlet");

        @SuppressWarnings("unchecked")
        Map<String, Object> diagnostics = (Map<String, Object>) report.get("diagnostics");
        assertEquals(List.of("2026-11-12", "2026-11-13"), diagnostics.get("missingDays"));
    }
}
