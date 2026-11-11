package com.orithos.modules.ai.report;

import com.alibaba.cloud.ai.graph.OverAllState;
import com.orithos.modules.report.ReportQueryService;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NativeReportQueryNodeTest {

    @Test
    void salesIntentUsesTheSharedReportAggregateForTheAuthenticatedOutlet() {
        NativeAiReportQueryService queryService = mock(NativeAiReportQueryService.class);
        ReportPeriodResolver resolver = mock(ReportPeriodResolver.class);
        ReportQueryService reportQuery = mock(ReportQueryService.class);
        NativeReportQueryNode node = new NativeReportQueryNode(queryService, resolver, reportQuery);
        OverAllState state = mock(OverAllState.class);
        LocalDateTime from = LocalDateTime.of(2026, 10, 16, 0, 0);
        LocalDateTime to = LocalDateTime.of(2026, 10, 17, 0, 0);
        when(state.value(anyString())).thenReturn(Optional.empty());
        when(state.value("intent", String.class)).thenReturn(Optional.of("report_sales"));
        when(state.value("question", String.class)).thenReturn(Optional.of("昨天利润如何？"));
        when(state.value("report_from")).thenReturn(Optional.of(from));
        when(state.value("report_to")).thenReturn(Optional.of(to));
        when(state.value("vendor_id")).thenReturn(Optional.of(55L));
        when(state.value("outlet_id")).thenReturn(Optional.of(87L));
        when(state.value("can_report_query")).thenReturn(Optional.of(true));
        when(state.value("can_report_cost")).thenReturn(Optional.of(true));
        when(state.value("slots")).thenReturn(Optional.of(Map.of("from", "2026-10-16", "to", "2026-10-16")));
        when(reportQuery.nativeOverview(55L, 87L, LocalDate.parse("2026-10-16"), LocalDate.parse("2026-10-16")))
                .thenReturn(Map.of("revenue", 100.00, "grossProfit", 30.00, "profitMargin", 30.00,
                        "costAvailable", true, "transactions", 3));

        Map<String, Object> result = node.apply(state);

        verify(reportQuery).nativeOverview(55L, 87L, LocalDate.parse("2026-10-16"), LocalDate.parse("2026-10-16"));
        verify(queryService, never()).query(any(), anyString(), any(), any());
        assertEquals("available", result.get("report_data_status"));
        assertEquals(30.00, ((Map<?, ?>) ((List<?>) result.get("report_rows")).get(0)).get("grossProfit"));
    }

    @Test
    void unsupportedQuestionsRemainReadOnlyAndCarryUnavailableProvenance() {
        NativeAiReportQueryService queryService = mock(NativeAiReportQueryService.class);
        NativeReportQueryNode node = new NativeReportQueryNode(queryService,
                mock(ReportPeriodResolver.class), mock(ReportQueryService.class));
        OverAllState state = mock(OverAllState.class);
        when(state.value(anyString())).thenReturn(Optional.empty());
        when(state.value("intent", String.class)).thenReturn(Optional.of("report_adhoc"));
        when(state.value("report_from")).thenReturn(Optional.of(LocalDateTime.of(2026, 10, 16, 0, 0)));
        when(state.value("report_to")).thenReturn(Optional.of(LocalDateTime.of(2026, 10, 17, 0, 0)));
        when(state.value("slots")).thenReturn(Optional.of(Map.of("from", "2026-10-16", "to", "2026-10-16")));

        Map<String, Object> result = node.apply(state);

        assertEquals("unavailable", result.get("report_data_status"));
        assertEquals("2026-10-16", result.get("report_period_from"));
        assertEquals("Australia/Adelaide", result.get("report_time_zone"));
        verify(queryService, never()).query(any(), anyString(), any(), any());
    }

    @Test
    void explicitDateComparisonQueriesBothDatesFromTheSharedOverview() {
        NativeAiReportQueryService queryService = mock(NativeAiReportQueryService.class);
        ReportQueryService reportQuery = mock(ReportQueryService.class);
        NativeReportQueryNode node = new NativeReportQueryNode(queryService, new ReportPeriodResolver(), reportQuery);
        OverAllState state = mock(OverAllState.class);
        when(state.value(anyString())).thenReturn(Optional.empty());
        when(state.value("intent", String.class)).thenReturn(Optional.of("report_sales"));
        when(state.value("question", String.class)).thenReturn(Optional.of(
                "Compare sales on 14 Oct 2026 with 15 Oct 2026"));
        when(state.value("vendor_id")).thenReturn(Optional.of(55L));
        when(state.value("outlet_id")).thenReturn(Optional.of(87L));
        when(state.value("can_report_query")).thenReturn(Optional.of(true));
        when(state.value("can_report_cost")).thenReturn(Optional.of(true));
        when(state.value("slots")).thenReturn(Optional.of(Map.of()));
        when(reportQuery.nativeOverview(55L, 87L, LocalDate.parse("2026-10-14"), LocalDate.parse("2026-10-14")))
                .thenReturn(Map.of("revenue", 100.0, "grossProfit", 30.0, "costAvailable", true, "transactions", 2));
        when(reportQuery.nativeOverview(55L, 87L, LocalDate.parse("2026-10-15"), LocalDate.parse("2026-10-15")))
                .thenReturn(Map.of("revenue", 120.0, "grossProfit", 35.0, "costAvailable", true, "transactions", 3));

        Map<String, Object> result = node.apply(state);
        @SuppressWarnings("unchecked")
        Map<String, Object> row = (Map<String, Object>) ((List<?>) result.get("report_rows")).get(0);

        assertEquals(true, row.get("comparison"));
        assertEquals("2026-10-14", row.get("firstDate"));
        assertEquals("2026-10-15", row.get("secondDate"));
        assertEquals("available", result.get("report_data_status"));
        assertEquals("2026-10-14", result.get("report_period_from"));
        assertEquals("2026-10-15", result.get("report_period_to"));
        verify(queryService, never()).query(any(), anyString(), any(), any());
    }

    @Test
    void salesRemainAvailableButProfitIsRedactedWithoutCostPermission() {
        NativeAiReportQueryService queryService = mock(NativeAiReportQueryService.class);
        ReportQueryService reportQuery = mock(ReportQueryService.class);
        NativeReportQueryNode node = new NativeReportQueryNode(queryService, new ReportPeriodResolver(), reportQuery);
        OverAllState state = mock(OverAllState.class);
        when(state.value(anyString())).thenReturn(Optional.empty());
        when(state.value("intent", String.class)).thenReturn(Optional.of("report_sales"));
        when(state.value("question", String.class)).thenReturn(Optional.of("yesterday sales and profit"));
        when(state.value("vendor_id")).thenReturn(Optional.of(55L));
        when(state.value("outlet_id")).thenReturn(Optional.of(87L));
        when(state.value("can_report_query")).thenReturn(Optional.of(true));
        when(reportQuery.nativeOverview(any(Long.class), any(Long.class), any(LocalDate.class), any(LocalDate.class)))
                .thenReturn(Map.of("revenue", 100.0, "grossProfit", 30.0, "costAvailable", true, "transactions", 2));

        Map<String, Object> result = node.apply(state);
        @SuppressWarnings("unchecked")
        Map<String, Object> row = (Map<String, Object>) ((List<?>) result.get("report_rows")).get(0);

        assertEquals(100.0, row.get("sales"));
        assertEquals(null, row.get("grossProfit"));
        assertEquals(false, row.get("costAvailable"));
        assertEquals("permission", row.get("profitUnavailableReason"));
    }

    @Test
    void reportResultCarriesReadonlyProvenanceMetadata() {
        NativeAiReportQueryService queryService = mock(NativeAiReportQueryService.class);
        ReportPeriodResolver resolver = mock(ReportPeriodResolver.class);
        ReportQueryService reportQuery = mock(ReportQueryService.class);
        NativeReportQueryNode node = new NativeReportQueryNode(queryService, resolver, reportQuery);
        OverAllState state = mock(OverAllState.class);
        LocalDateTime from = LocalDateTime.of(2026, 10, 16, 0, 0);
        LocalDateTime to = LocalDateTime.of(2026, 10, 17, 0, 0);

        when(state.value(anyString())).thenReturn(Optional.empty());
        when(state.value("intent", String.class)).thenReturn(Optional.of("report_qty"));
        when(state.value("report_from")).thenReturn(Optional.of(from));
        when(state.value("report_to")).thenReturn(Optional.of(to));
        when(state.value("slots")).thenReturn(Optional.of(Map.of("from", "2026-10-16", "to", "2026-10-16")));
        when(queryService.query(any(TenantContext.class), anyString(), any(), any()))
                .thenReturn(new NativeAiReportQueryService.Result(
                        List.of(Map.of("date", "2026-10-16", "sales", 7738.14)), null));

        Map<String, Object> result = node.apply(state);

        assertEquals("orithos", result.get("report_data_source"));
        assertEquals("orithos_template", result.get("sql_path"));
        assertEquals("current_authenticated_store", result.get("report_store_scope"));
        assertTrue(String.valueOf(result.get("report_data_as_of")).contains("+10:30")
                || String.valueOf(result.get("report_data_as_of")).contains("+09:30"));
        assertEquals("2026-10-16", result.get("report_period_from"));
        assertEquals("Australia/Adelaide", result.get("report_time_zone"));
        assertEquals("available", result.get("report_data_status"));
    }
}
