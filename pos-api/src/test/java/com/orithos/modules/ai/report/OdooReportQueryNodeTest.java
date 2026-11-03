package com.orithos.modules.ai.report;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OdooReportQueryNodeTest {

    @Test
    void reportResultCarriesReadonlyProvenanceMetadata() {
        OdooReportQueryService queryService = mock(OdooReportQueryService.class);
        ReportPeriodResolver resolver = mock(ReportPeriodResolver.class);
        OdooReportQueryNode node = new OdooReportQueryNode(queryService, resolver);
        OverAllState state = mock(OverAllState.class);
        LocalDateTime from = LocalDateTime.of(2026, 10, 16, 0, 0);
        LocalDateTime to = LocalDateTime.of(2026, 10, 17, 0, 0);

        when(state.value(anyString())).thenReturn(Optional.empty());
        when(state.value("intent", String.class)).thenReturn(Optional.of("report_sales"));
        when(state.value("report_from")).thenReturn(Optional.of(from));
        when(state.value("report_to")).thenReturn(Optional.of(to));
        when(state.value("slots")).thenReturn(Optional.of(Map.of("from", "2026-10-16", "to", "2026-10-16")));
        when(queryService.businessTimezone(any(TenantContext.class))).thenReturn(ZoneId.of("Australia/Adelaide"));
        when(queryService.query(any(TenantContext.class), anyString(), any(), any()))
                .thenReturn(new OdooReportQueryService.Result(
                        List.of(Map.of("date", "2026-10-16", "sales", 7738.14)), null));

        Map<String, Object> result = node.apply(state);

        assertEquals("odoo", result.get("report_data_source"));
        assertEquals("current_authenticated_store", result.get("report_store_scope"));
        assertTrue(String.valueOf(result.get("report_data_as_of")).startsWith("2026-10-17T00:00"));
    }
}
