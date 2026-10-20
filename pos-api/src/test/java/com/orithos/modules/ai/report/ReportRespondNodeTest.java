package com.orithos.modules.ai.report;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReportRespondNodeTest {

    private final AiReportAuditService auditService = mock(AiReportAuditService.class);
    private final ReportRespondNode node = new ReportRespondNode(auditService);

    @Test
    void emptyDayIsReportedAsAValidNoDataResultAndAudited() {
        OverAllState state = state("", List.of());

        Map<String, Object> result = node.apply(state);

        assertEquals("No data found for 2026-10-20.", result.get("answer"));
        verify(auditService).record(state);
    }

    @Test
    void unavailableOdooIsNotReportedAsAnEmptyDay() {
        assertError("ODOO_REPORT_UNAVAILABLE", "Live Odoo reporting is temporarily unavailable. Please try again.");
    }

    @Test
    void unlinkedStoreAndMissingPermissionHaveDistinctGuidance() {
        assertError("ODOO_REPORT_STORE_UNLINKED",
                "This store is not linked to an Odoo company for live reporting. Contact your administrator.");
        assertError("NO_PERMISSION", "You do not have permission to query reports.");
    }

    @Test
    void unsupportedAndOversizedReportsAskForSupportedNarrowerQueries() {
        assertError("ODOO_REPORT_UNSUPPORTED",
                "That report type is not available from live Odoo data yet. Try sales, quantity, average ticket, stock, or dead stock.");
        assertError("ODOO_REPORT_TOO_LARGE",
                "That report is too large to summarize safely. Add a product filter or narrow the date range.");
    }

    private void assertError(String code, String expected) {
        OverAllState state = state(code, List.of());

        Map<String, Object> result = node.apply(state);

        assertEquals(expected, result.get("answer"));
        verify(auditService).record(state);
    }

    private OverAllState state(String error, List<Map<String, Object>> rows) {
        OverAllState state = mock(OverAllState.class);
        when(state.value("intent", String.class)).thenReturn(Optional.of("report_sales"));
        when(state.value("sql_error", String.class)).thenReturn(Optional.of(error));
        when(state.value("report_rows")).thenReturn(Optional.<Object>of(rows));
        when(state.value("slots")).thenReturn(Optional.<Object>of(
                Map.of("from", "2026-10-20", "to", "2026-10-20")));
        return state;
    }
}
