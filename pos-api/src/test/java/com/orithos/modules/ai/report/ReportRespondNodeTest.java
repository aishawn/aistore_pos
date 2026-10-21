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

        assertEquals("No completed sales found for 2026-10-20. Try a wider range, for example: sales last 7 days.", result.get("answer"));
        verify(auditService).record(state);
    }

    @Test
    void salesSummaryIncludesAudAndUsesSingularDayForSingleDate() {
        OverAllState state = state("", List.of(Map.of("date", "2026-10-16", "sales", 12.99)),
                "2026-10-16", "2026-10-16");

        assertEquals("Sales for 2026-10-16 total AUD 12.99 (1 day).", node.apply(state).get("answer"));
    }

    @Test
    void salesSummaryUsesPluralDaysForMultiDayRange() {
        OverAllState state = state("", List.of(
                Map.of("date", "2026-10-19", "sales", 12.99),
                Map.of("date", "2026-10-20", "sales", 5.01)), "2026-10-19", "2026-10-20");

        assertEquals("Sales for 2026-10-19 to 2026-10-20 total AUD 18.00 (2 days).",
                node.apply(state).get("answer"));
    }

    @Test
    void averageTicketSummaryIncludesAudAndUsesSingularSale() {
        OverAllState state = state("", List.of(Map.of("sales", 12.99, "tickets", 1, "aov", 12.99)));
        when(state.value("intent", String.class)).thenReturn(Optional.of("report_aov"));

        assertEquals("Average Ticket for 2026-10-20 is AUD 12.99 across 1 sale.", node.apply(state).get("answer"));
    }

    @Test
    void unavailableOdooIsNotReportedAsAnEmptyDay() {
        assertError("ODOO_REPORT_UNAVAILABLE", "Live Odoo reporting is temporarily unavailable. Please try again.");
    }

    @Test
    void unavailableStockSourceOffersAReadOnlyFallbackInsteadOfSayingTheProductIsMissing() {
        OverAllState state = state("ODOO_REPORT_UNAVAILABLE", List.of());
        when(state.value("intent", String.class)).thenReturn(Optional.of("report_stock"));

        assertEquals("I could not read live stock data right now. Open the stock list to check manually, or try again shortly.",
                node.apply(state).get("answer"));
    }

    @Test
    void emptyStockAndDeadStockUseDomainSpecificGuidance() {
        OverAllState stock = state("", List.of());
        when(stock.value("intent", String.class)).thenReturn(Optional.of("report_stock"));
        assertEquals("No matching stock found. Check the product name or catalogue spelling.", node.apply(stock).get("answer"));

        OverAllState deadStock = state("", List.of());
        when(deadStock.value("intent", String.class)).thenReturn(Optional.of("report_dead_stock"));
        assertEquals("No dead-stock items found for the selected period.", node.apply(deadStock).get("answer"));
    }

    @Test
    void unlinkedStoreAndMissingPermissionHaveDistinctGuidance() {
        assertError("ODOO_REPORT_STORE_UNLINKED",
                "This store is not linked to an Odoo company for live reporting. Contact your administrator.");
        OverAllState stock = state("ODOO_REPORT_STORE_UNLINKED", List.of());
        when(stock.value("intent", String.class)).thenReturn(Optional.of("report_stock"));
        assertEquals("This store is not linked to an Odoo company for live stock lookup. Contact your administrator.",
                node.apply(stock).get("answer"));
        assertError("NO_PERMISSION", "You do not have permission to query reports.");
    }

    @Test
    void unsupportedAndOversizedReportsAskForSupportedNarrowerQueries() {
        assertError("ODOO_REPORT_UNSUPPORTED",
                "I can't run that custom comparison yet. Try: Today's sales, average ticket this week, "
                        + "how much [product] is in stock, or dead stock last 30 days.");
        assertError("ODOO_REPORT_TOO_LARGE",
                "That report is too large to summarize safely. Add a product filter or narrow the date range.");
    }

    @Test
    void internalQueryFailureCodesNeverReachTheEmployee() {
        assertError("SQL_GUARD_REJECTED", "That question cannot be queried (security check failed).");
        assertError("EXEC_QUERY_FAILED", "The query failed. Please try again.");
        assertError("QUOTA_EXCEEDED", "This store has reached its hourly report quota. Try again later.");
    }

    private void assertError(String code, String expected) {
        OverAllState state = state(code, List.of());

        Map<String, Object> result = node.apply(state);

        assertEquals(expected, result.get("answer"));
        verify(auditService).record(state);
    }

    private OverAllState state(String error, List<Map<String, Object>> rows) {
        return state(error, rows, "2026-10-20", "2026-10-20");
    }

    private OverAllState state(String error, List<Map<String, Object>> rows, String from, String to) {
        OverAllState state = mock(OverAllState.class);
        when(state.value("intent", String.class)).thenReturn(Optional.of("report_sales"));
        when(state.value("sql_error", String.class)).thenReturn(Optional.of(error));
        when(state.value("report_rows")).thenReturn(Optional.<Object>of(rows));
        when(state.value("slots")).thenReturn(Optional.<Object>of(
                Map.of("from", from, "to", to)));
        return state;
    }
}
