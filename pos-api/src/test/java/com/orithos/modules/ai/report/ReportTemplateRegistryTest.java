package com.orithos.modules.ai.report;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ReportTemplateRegistryTest {

    private final ReportTemplateRegistry registry = new ReportTemplateRegistry();

    @Test
    void dropsMetricWordCategory() {
        assertNull(ReportTemplateRegistry.sanitizeCategory("销量"));
        assertNull(ReportTemplateRegistry.sanitizeCategory("sales"));
        assertEquals("Beer Local", ReportTemplateRegistry.sanitizeCategory("Beer Local"));
    }

    @Test
    void todayQtyIgnoresMetricCategory() {
        TenantContext tenant = new TenantContext(
                1L, 1L, 1L, List.of(1L), Set.of(TenantContext.PERM_QUERY));
        LocalDate today = LocalDate.now();
        ReportPeriodResolver.Window window = new ReportPeriodResolver.Window(
                today.atStartOfDay(), today.plusDays(1).atStartOfDay(), 1);
        ReportTemplateRegistry.BoundSql bound = registry.bind(
                "report_qty", tenant, Map.of("category", "销量"), window);
        assertNull(bound.error());
        assertFalse(bound.sql().contains("category_name"));
        assertTrue(bound.sql().contains("SUM(qty)"));
        assertEquals(3, bound.params().size());
    }

    @Test
    void beerCategoryMatchesEnglishCatalogue() {
        TenantContext tenant = new TenantContext(
                1L, 1L, 1L, List.of(1L), Set.of(TenantContext.PERM_QUERY));
        LocalDate day = LocalDate.of(2026, 8, 14);
        ReportPeriodResolver.Window window = new ReportPeriodResolver.Window(
                day.atStartOfDay(), day.plusDays(1).atStartOfDay(), 1);
        ReportTemplateRegistry.BoundSql bound = registry.bind(
                "report_qty", tenant, Map.of("category", "啤酒类"), window);
        assertNull(bound.error());
        assertTrue(bound.sql().contains("category_name LIKE ?"));
        List<Object> likes = bound.params().subList(4, bound.params().size());
        assertTrue(likes.stream().anyMatch(p -> String.valueOf(p).equalsIgnoreCase("%beer%")));
        assertTrue(likes.stream().anyMatch(p -> String.valueOf(p).equals("%啤酒%")));
    }
}
