package com.orithos.modules.ai.report;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
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

        assertEquals("No completed sales found for 2026-10-20. Try a wider range — for example ask: sales last 7 days, or yesterday / last week.", result.get("answer"));
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
    void quantitySummaryUsesUnitsInsteadOfAud() {
        OverAllState state = state("", List.of(
                Map.of("date", "2026-10-19", "qty", 2.25),
                Map.of("date", "2026-10-20", "qty", 3.5)), "2026-10-19", "2026-10-20");
        when(state.value("intent", String.class)).thenReturn(Optional.of("report_qty"));

        assertEquals("Quantity sold for 2026-10-19 to 2026-10-20 total 5.75 units (2 days).",
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
        assertEquals("No dead-stock items found for the selected period."
                        + " Try asking for dead stock last 60 days if you want a wider window.",
                node.apply(deadStock).get("answer"));
    }

    @Test
    void deadStockAndCashValueAnswersFollowChineseQuestionLanguage() {
        OverAllState deadStock = state("", List.of(Map.of("name", "Wine", "on_hand", 3, "sold_qty", 0)));
        when(deadStock.value("intent", String.class)).thenReturn(Optional.of("report_dead_stock"));
        when(deadStock.value("question", String.class)).thenReturn(Optional.of("连续30天没有销售的商品有哪些？"));
        String deadAnswer = (String) node.apply(deadStock).get("answer");
        org.junit.jupiter.api.Assertions.assertTrue(deadAnswer.contains("滞销商品"));
        org.junit.jupiter.api.Assertions.assertTrue(deadAnswer.contains("Orithos"));
        org.junit.jupiter.api.Assertions.assertTrue(deadAnswer.contains("2026-10-20"));

        OverAllState stockValue = state("", List.of(Map.of("name", "Wine", "inventory_value", 12.5)));
        when(stockValue.value("intent", String.class)).thenReturn(Optional.of("report_stock_value"));
        when(stockValue.value("question", String.class)).thenReturn(Optional.of("哪些库存占用了最多现金？"));
        org.junit.jupiter.api.Assertions.assertTrue(((String) node.apply(stockValue).get("answer")).contains("库存资金占用"));
    }

    @Test
    void stockValueAnswerSeparatesStorewideTotalFromTopEightSubtotal() {
        List<Map<String, Object>> rows = new java.util.ArrayList<>();
        BigDecimal total = BigDecimal.ZERO;
        for (int i = 1; i <= 10; i++) {
            BigDecimal value = BigDecimal.valueOf(i * 10L);
            total = total.add(value);
            rows.add(new java.util.HashMap<>(Map.of("name", "Product " + i, "inventory_value", value,
                    "store_inventory_value_total", BigDecimal.valueOf(550),
                    "valued_product_count", 10, "excluded_product_count", 2)));
        }
        OverAllState stockValue = state("", rows);
        when(stockValue.value("intent", String.class)).thenReturn(Optional.of("report_stock_value"));
        when(stockValue.value("question", String.class)).thenReturn(Optional.of("当前库存占了多少钱？"));

        String answer = (String) node.apply(stockValue).get("answer");

        org.junit.jupiter.api.Assertions.assertTrue(answer.contains("全店有记录成本的现有库存估值 AUD 550.00"));
        org.junit.jupiter.api.Assertions.assertTrue(answer.contains("前 8 个商品小计 AUD 360.00"));
        org.junit.jupiter.api.Assertions.assertFalse(answer.contains("前 8 个合计 AUD 550.00"));
        org.junit.jupiter.api.Assertions.assertTrue(answer.contains("Orithos"));
    }

    @Test
    void stockValueWithoutSummaryDoesNotClaimReturnedRowsAreStorewideTotal() {
        OverAllState stockValue = state("", List.of(
                Map.of("name", "Wine", "inventory_value", BigDecimal.valueOf(12.5))));
        when(stockValue.value("intent", String.class)).thenReturn(Optional.of("report_stock_value"));
        when(stockValue.value("question", String.class)).thenReturn(Optional.of("当前库存占了多少钱？"));

        String answer = (String) node.apply(stockValue).get("answer");

        org.junit.jupiter.api.Assertions.assertTrue(answer.contains("不能视为全店总额"));
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
