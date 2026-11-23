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

    @Test
    void averageTicketCannotUseTheLegacyCustomerSaleAggregation() {
        TenantContext tenant = new TenantContext(
                55L, 12L, 87L, List.of(87L), Set.of(TenantContext.PERM_QUERY));
        LocalDate day = LocalDate.of(2026, 11, 12);
        ReportPeriodResolver.Window window = new ReportPeriodResolver.Window(
                day.atStartOfDay(), day.plusDays(1).atStartOfDay(), 1);

        ReportTemplateRegistry.BoundSql bound = registry.bind("report_aov", tenant, Map.of(), window);

        assertEquals("AUTHORITATIVE_REPORT_REQUIRED", bound.error());
    }

    @Test
    void stockValueUsesTenantScopedOrithosCostView() {
        TenantContext tenant = new TenantContext(
                55L, 12L, 87L, List.of(87L), Set.of(TenantContext.PERM_QUERY, TenantContext.PERM_COST));
        LocalDate day = LocalDate.of(2026, 11, 10);
        ReportPeriodResolver.Window window = new ReportPeriodResolver.Window(
                day.atStartOfDay(), day.plusDays(1).atStartOfDay(), 1);

        ReportTemplateRegistry.BoundSql bound = registry.bind(
                "report_stock_value", tenant, Map.of(), window);

        assertNull(bound.error());
        assertTrue(bound.sql().contains("ai_rpt_inventory_cost"));
        assertTrue(bound.sql().contains("ai_rpt_product_core"));
        assertFalse(bound.sql().contains("JOIN ai_rpt_product p"));
        assertTrue(bound.sql().contains("i.outlet_id = ?"));
        assertTrue(bound.sql().contains("store_summary AS"));
        assertTrue(bound.sql().contains("top_products AS"));
        assertTrue(bound.sql().contains("LEFT JOIN top_products"));
        assertTrue(bound.sql().contains("i.quantity * c.case_cost / c.case_quantity"));
        assertTrue(bound.sql().contains("ELSE i.quantity * c.cost"));
        assertTrue(bound.sql().contains("AND COALESCE(c.case_cost, c.cost, 0) > 0"));
        assertTrue(bound.sql().contains(
                "COUNT(*) FILTER (WHERE COALESCE(c.case_cost, c.cost, 0) <= 0)"));
        assertTrue(bound.sql().contains("MAX(i.updated_at)"));
        assertTrue(bound.sql().contains("s.excluded_product_count > 0 THEN 'incomplete'"));
        assertTrue(bound.sql().contains("LIMIT 8"));
        assertFalse(bound.sql().contains("OVER ()"));
        assertEquals(List.of(87L, 87L), bound.params());
    }

    @Test
    void stockLookupReportsAnAsOfOnlyWhenEveryMatchingInventoryRowHasOne() {
        TenantContext tenant = new TenantContext(
                55L, 12L, 87L, List.of(87L), Set.of(TenantContext.PERM_QUERY));
        LocalDate day = LocalDate.of(2026, 11, 19);
        ReportPeriodResolver.Window window = new ReportPeriodResolver.Window(
                day.atStartOfDay(), day.plusDays(1).atStartOfDay(), 1);

        ReportTemplateRegistry.BoundSql bound = registry.bind(
                "report_stock", tenant, Map.of("query", "Shiraz"), window);

        assertNull(bound.error());
        assertTrue(bound.sql().contains("p.name ILIKE ?"));
        assertTrue(bound.sql().contains("i.updated_at"));
        assertTrue(bound.sql().contains("COUNT(*) OVER () = COUNT(i.updated_at) OVER ()"));
        assertTrue(bound.sql().contains("MIN(i.updated_at) OVER ()"));
        assertTrue(bound.sql().contains("current_setting('TimeZone')"));
        assertTrue(bound.sql().contains("AS \"dataAsOf\""));
        assertEquals(List.of(87L, 87L, "%Shiraz%"), bound.params());
    }
}
