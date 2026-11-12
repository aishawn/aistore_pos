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
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
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

    private static TenantContext tenant(Set<String> permissions) {
        return new TenantContext(55L, 12L, 87L, List.of(87L), permissions);
    }
}
