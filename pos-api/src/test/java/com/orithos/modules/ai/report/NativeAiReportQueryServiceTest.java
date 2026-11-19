package com.orithos.modules.ai.report;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import com.orithos.modules.report.ReportQueryService;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;

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

class NativeAiReportQueryServiceTest {

    private final AiReportDataSourceRegistry dataSources = mock(AiReportDataSourceRegistry.class);
    private final ReportTemplateRegistry templates = mock(ReportTemplateRegistry.class);
    private final ReportQueryService reportQuery = mock(ReportQueryService.class);
    private final NativeAiReportQueryService service = new NativeAiReportQueryService(dataSources, templates, reportQuery);
    private final ReportPeriodResolver.Window window = new ReportPeriodResolver.Window(
            LocalDateTime.parse("2026-11-10T00:00:00"), LocalDateTime.parse("2026-11-11T00:00:00"), 1);

    @Test
    void executesBoundTemplateAgainstOutletScopedOrithosReadSource() {
        TenantContext tenant = tenant(Set.of(TenantContext.PERM_QUERY));
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(templates.bind("report_sales", tenant, Map.of(), window))
                .thenReturn(ReportTemplateRegistry.BoundSql.ok("SELECT * FROM ai_rpt_sale_item WHERE outlet_id = ?", List.of(87L)));
        when(dataSources.jdbc(87L)).thenReturn(jdbc);
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("sales", 42.50)));

        NativeAiReportQueryService.Result result = service.query(tenant, "report_sales", Map.of(), window);

        assertEquals(null, result.error());
        assertEquals(42.50, result.rows().get(0).get("sales"));
        verify(dataSources).jdbc(87L);
    }

    @Test
    void averageTicketUsesTheSharedOverviewInsteadOfTheLegacyCustomerSaleView() {
        TenantContext tenant = tenant(Set.of(TenantContext.PERM_QUERY));
        when(reportQuery.nativeOverview(55L, 87L, window.from().toLocalDate(),
                window.toExclusive().minusNanos(1).toLocalDate()))
                .thenReturn(Map.of("averageSale", 27.99, "transactions", 185, "grossSales", 5178.94));

        NativeAiReportQueryService.Result result = service.query(tenant, "report_aov", Map.of(), window);

        assertEquals(null, result.error());
        assertEquals(27.99, result.rows().get(0).get("aov"));
        assertEquals(185, result.rows().get(0).get("tickets"));
        assertEquals(5178.94, result.rows().get(0).get("sales"));
        verify(reportQuery).nativeOverview(55L, 87L, window.from().toLocalDate(),
                window.toExclusive().minusNanos(1).toLocalDate());
        verify(templates, never()).bind(anyString(), any(), any(), any());
        verify(dataSources, never()).jdbc(anyLong());
    }

    @Test
    void stockSummaryUsesOutletScopedAuthoritativeOverview() {
        TenantContext tenant = tenant(Set.of(TenantContext.PERM_QUERY));
        when(reportQuery.nativeOverview(55L, 87L, window.from().toLocalDate(),
                window.toExclusive().minusNanos(1).toLocalDate())).thenReturn(Map.of(
                "inventoryAvailable", true, "inventoryUnits", 53409L,
                "inventoryPositiveSkuCount", 3063L, "negativeStockProducts", 5373L,
                "inventorySkuCount", 10859L, "dataSource", "orithos_ledger"));

        NativeAiReportQueryService.Result result = service.query(tenant, "report_stock_summary", Map.of(), window);

        assertEquals(null, result.error());
        assertEquals(53_409L, result.rows().get(0).get("positiveUnits"));
        assertEquals(3_063L, result.rows().get(0).get("positiveSkus"));
        assertEquals(5_373L, result.rows().get(0).get("negativeSkus"));
        assertEquals(10_859L, result.rows().get(0).get("totalSkus"));
        verify(reportQuery).nativeOverview(55L, 87L, window.from().toLocalDate(),
                window.toExclusive().minusNanos(1).toLocalDate());
        verify(dataSources, never()).jdbc(anyLong());
    }

    @Test
    void averageTicketDoesNotTurnAnEmptyPeriodIntoZeroAverage() {
        TenantContext tenant = tenant(Set.of(TenantContext.PERM_QUERY));
        when(reportQuery.nativeOverview(55L, 87L, window.from().toLocalDate(),
                window.toExclusive().minusNanos(1).toLocalDate()))
                .thenReturn(Map.of("transactions", 0L, "grossSales", 0));

        NativeAiReportQueryService.Result result = service.query(tenant, "report_aov", Map.of(), window);

        assertEquals(null, result.error());
        assertEquals(List.of(), result.rows());
        verify(dataSources, never()).jdbc(anyLong());
    }

    @Test
    void averageTicketFailsClosedWhenAuthoritativeMetricsAreIncomplete() {
        TenantContext tenant = tenant(Set.of(TenantContext.PERM_QUERY));
        when(reportQuery.nativeOverview(55L, 87L, window.from().toLocalDate(),
                window.toExclusive().minusNanos(1).toLocalDate()))
                .thenReturn(Map.of("transactions", 3L, "grossSales", 80.00));

        NativeAiReportQueryService.Result result = service.query(tenant, "report_aov", Map.of(), window);

        assertEquals("AUTHORITATIVE_REPORT_INCOMPLETE", result.error());
        assertEquals(List.of(), result.rows());
        verify(dataSources, never()).jdbc(anyLong());
    }

    @Test
    void deniesCostTemplateBeforeOpeningTheReadSourceWithoutCostPermission() {
        TenantContext tenant = tenant(Set.of(TenantContext.PERM_QUERY));

        NativeAiReportQueryService.Result result = service.query(tenant, "report_stock_value", Map.of(), window);

        assertEquals("NO_COST_PERMISSION", result.error());
        verify(dataSources, never()).jdbc(anyLong());
        verify(templates, never()).bind(anyString(), any(), any(), any());
    }

    @Test
    void countsSellableProductsThroughTheLightweightOutletScopedView() {
        TenantContext tenant = tenant(Set.of(TenantContext.PERM_QUERY));
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        String sql = "SELECT COUNT(*) FROM ai_rpt_product_count WHERE outlet_id = ? AND status = 'ACTIVE'";
        when(dataSources.jdbc(87L)).thenReturn(jdbc);
        when(jdbc.queryForObject(eq(sql), eq(Integer.class), eq(87L))).thenReturn(10_852);

        NativeAiReportQueryService.ProductCountResult result = service.countSellableProducts(tenant);

        assertEquals(null, result.error());
        assertEquals(10_852, result.count());
        verify(jdbc).queryForObject(eq(sql), eq(Integer.class), eq(87L));
    }

    @Test
    void searchesProductCandidatesBeforeLoadingPriceAndInventoryDetails() {
        TenantContext tenant = tenant(Set.of(TenantContext.PERM_QUERY));
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(dataSources.jdbc(87L)).thenReturn(jdbc);
        when(jdbc.queryForList(org.mockito.ArgumentMatchers.contains("FROM ai_rpt_product_count p"),
                eq(87L), eq("%VB Cans%"), eq(8)))
                .thenReturn(List.of(Map.of("id", 42L, "name", "VB Cans 375ML")));
        when(jdbc.queryForList(org.mockito.ArgumentMatchers.contains("FROM ai_rpt_product_barcode b"),
                eq(87L), eq("%VB Cans%"), eq(8))).thenReturn(List.of());
        when(jdbc.queryForList(org.mockito.ArgumentMatchers.contains("FROM ai_rpt_product p"),
                eq(87L), eq(42L)))
                .thenReturn(List.of(Map.of("id", 42L, "name", "VB Cans 375ML", "barcode", "9312345678901",
                        "list_price", 8.50, "quantity", 12)));

        NativeAiReportQueryService.ProductSearchResult result = service.searchProducts(tenant, "VB Cans", 8);

        assertEquals(null, result.error());
        assertEquals("VB Cans 375ML", result.rows().get(0).get("name"));
        assertEquals(12, result.rows().get(0).get("quantity"));
        verify(jdbc).queryForList(org.mockito.ArgumentMatchers.contains("FROM ai_rpt_product_count p"),
                eq(87L), eq("%VB Cans%"), eq(8));
        verify(jdbc).queryForList(org.mockito.ArgumentMatchers.contains("FROM ai_rpt_product p"),
                eq(87L), eq(42L));
    }

    @Test
    void searchesNumericBarcodeExactlyThroughTheOutletScopedBarcodeView() {
        TenantContext tenant = tenant(Set.of(TenantContext.PERM_QUERY));
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(dataSources.jdbc(87L)).thenReturn(jdbc);
        when(jdbc.queryForList(org.mockito.ArgumentMatchers.contains("FROM ai_rpt_product_count p"),
                eq(87L), eq("%9312345678901%"), eq(8))).thenReturn(List.of());
        when(jdbc.queryForList(org.mockito.ArgumentMatchers.contains("FROM ai_rpt_product_barcode b"),
                eq(87L), eq("9312345678901"), eq(8)))
                .thenReturn(List.of(Map.of("id", 42L, "name", "VB Cans 375ML")));
        when(jdbc.queryForList(org.mockito.ArgumentMatchers.contains("FROM ai_rpt_product p"),
                eq(87L), eq(42L)))
                .thenReturn(List.of(Map.of("id", 42L, "name", "VB Cans 375ML", "barcode", "9312345678901",
                        "list_price", 8.50, "quantity", 12)));

        NativeAiReportQueryService.ProductSearchResult result = service.searchProducts(tenant, "9312345678901", 8);

        assertEquals(null, result.error());
        assertEquals("VB Cans 375ML", result.rows().get(0).get("name"));
        verify(jdbc).queryForList(org.mockito.ArgumentMatchers.contains("ai_rpt_product_barcode"),
                eq(87L), eq("9312345678901"), eq(8));
    }

    @Test
    void returnsNoMatchesWithoutExpandingTheDetailedProductView() {
        TenantContext tenant = tenant(Set.of(TenantContext.PERM_QUERY));
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(dataSources.jdbc(87L)).thenReturn(jdbc);
        when(jdbc.queryForList(org.mockito.ArgumentMatchers.contains("FROM ai_rpt_product_count p"),
                eq(87L), eq("%missing%"), eq(8))).thenReturn(List.of());
        when(jdbc.queryForList(org.mockito.ArgumentMatchers.contains("FROM ai_rpt_product_barcode b"),
                eq(87L), eq("%missing%"), eq(8))).thenReturn(List.of());

        NativeAiReportQueryService.ProductSearchResult result = service.searchProducts(tenant, "missing", 8);

        assertEquals(null, result.error());
        assertEquals(List.of(), result.rows());
        verify(jdbc, never()).queryForList(org.mockito.ArgumentMatchers.contains("FROM ai_rpt_product p"),
                any(Object[].class));
    }

    @Test
    void recommendationCatalogUsesSingleBoundedQueryAndCachesPerOutletUntilTtlExpires() {
        long[] now = {1_000L};
        NativeAiReportQueryService cachedService = new NativeAiReportQueryService(
                dataSources, templates, reportQuery, () -> now[0]);
        TenantContext firstOutlet = tenant(Set.of(TenantContext.PERM_QUERY));
        TenantContext secondOutlet = new TenantContext(55L, 12L, 88L, List.of(88L),
                Set.of(TenantContext.PERM_QUERY));
        JdbcTemplate firstJdbc = mock(JdbcTemplate.class);
        JdbcTemplate secondJdbc = mock(JdbcTemplate.class);
        List<Map<String, Object>> products = List.of(Map.of(
                "id", 1L, "name", "Harbour Lager", "list_price", 12.50,
                "sell_price", 12.50, "quantity", 8, "category", "Beer"));
        when(dataSources.jdbc(87L)).thenReturn(firstJdbc);
        when(dataSources.jdbc(88L)).thenReturn(secondJdbc);
        when(firstJdbc.queryForList(anyString(), any(Object[].class))).thenReturn(products);
        when(secondJdbc.queryForList(anyString(), any(Object[].class))).thenReturn(products);

        cachedService.listRecommendationProducts(firstOutlet);
        cachedService.listRecommendationProducts(firstOutlet);
        cachedService.listRecommendationProducts(secondOutlet);

        verify(firstJdbc, times(1)).queryForList(anyString(), any(Object[].class));
        verify(secondJdbc, times(1)).queryForList(anyString(), any(Object[].class));
        verify(firstJdbc).queryForList(org.mockito.ArgumentMatchers.contains("LIMIT ?"), eq(87L), eq(10_000));

        now[0] += 15_000L;
        cachedService.listRecommendationProducts(firstOutlet);

        verify(firstJdbc, times(2)).queryForList(anyString(), any(Object[].class));
    }

    private static TenantContext tenant(Set<String> permissions) {
        return new TenantContext(55L, 12L, 87L, List.of(87L), permissions);
    }
}
