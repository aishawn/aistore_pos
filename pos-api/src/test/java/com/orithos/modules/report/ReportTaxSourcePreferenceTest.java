package com.orithos.modules.report;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ReportTaxSourcePreferenceTest {

    @Test
    void nativeSalesHistoryPrefersCompleteShopfrontLineTaxOverSaleHeaderTax() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), eq(Integer.class), any(), any())).thenReturn(1);
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());

        new ReportQueryService(jdbc).nativeSalesHistory(
                1L, 2L, LocalDate.parse("2026-11-15"), LocalDate.parse("2026-11-15"));

        org.mockito.ArgumentCaptor<String> sql = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(jdbc).queryForList(sql.capture(), any(Object[].class));
        assertTrue(sql.getValue().replaceAll("\\s+", " ").contains(
                "COALESCE(CASE WHEN s.source_system = 'shopfront' AND line.item_count > 0 AND line.tax_missing_count = 0 THEN line.tax END, s.total_tax)"));
    }

    @Test
    void nativeSalesOverviewPrefersCompleteShopfrontLineTaxOverSaleHeaderTax() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), eq(Integer.class), any(), any())).thenReturn(1);
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());

        new ReportQueryService(jdbc).nativeSalesOverview(
                1L, 2L, LocalDate.parse("2026-11-15"), LocalDate.parse("2026-11-15"));

        org.mockito.ArgumentCaptor<String> sql = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(jdbc).queryForList(sql.capture(), any(Object[].class));
        assertTrue(sql.getValue().replaceAll("\\s+", " ").contains(
                "COALESCE(CASE WHEN s.source_system = 'shopfront' AND line.line_count > 0 AND line.missing_tax_count = 0 THEN line.tax END, s.total_tax)"));
        assertTrue(sql.getValue().replaceAll("\\s+", " ").contains(
                "CASE WHEN s.source_system = 'shopfront' THEN COALESCE(CASE WHEN line.line_count > 0 AND line.missing_cost_count = 0 THEN line.cost END, s.total_cost, 0)"));
    }
}
