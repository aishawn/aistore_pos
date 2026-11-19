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
    void authoritativeSalesAnswerIncludesProfitAndExplainsItsBasis() {
        OverAllState state = state("", List.of(Map.of("sales", 125.50, "grossProfit", 40.25,
                "costAvailable", true, "transactions", 4)), "2026-10-16", "2026-10-16");
        when(state.value("intent", String.class)).thenReturn(Optional.of("report_sales"));

        assertEquals("Sales for 2026-10-16 were AUD 125.50 and gross profit was AUD 40.25 (ex-GST sales less cost). Source: Orithos POS report.",
                node.apply(state).get("answer"));
    }

    @Test
    void authoritativeSalesAnswerUsesChineseExGstGrossProfitBasis() {
        OverAllState state = state("", List.of(Map.of("sales", 125.50, "grossProfit", 40.25,
                "costAvailable", true, "transactions", 4)), "2026-10-16", "2026-10-16");
        when(state.value("intent", String.class)).thenReturn(Optional.of("report_sales"));
        when(state.value("question", String.class)).thenReturn(Optional.of("昨天毛利是多少？"));

        assertEquals("2026-10-16营业额 AUD 125.50，毛利 AUD 40.25（税前营业额减成本）。数据来源：Orithos POS 报表。",
                node.apply(state).get("answer"));
    }

    @Test
    void authoritativeSalesDoesNotReportProfitWhenTaxCoverageIsIncomplete() {
        OverAllState state = state("", List.of(Map.of("sales", 125.50, "grossProfit", "",
                "costAvailable", true, "profitUnavailableReason", "tax", "transactions", 4)),
                "2026-10-16", "2026-10-16");
        when(state.value("intent", String.class)).thenReturn(Optional.of("report_sales"));

        assertEquals("Sales for 2026-10-16 were AUD 125.50; gross profit is unavailable because sale tax data is incomplete. Source: Orithos POS report.",
                node.apply(state).get("answer"));
    }

    @Test
    void authoritativeSalesDoesNotInventProfitWhenCostsAreIncomplete() {
        OverAllState state = state("", List.of(Map.of("sales", 125.50, "grossProfit", "",
                "costAvailable", false, "transactions", 4)), "2026-10-16", "2026-10-16");
        when(state.value("intent", String.class)).thenReturn(Optional.of("report_sales"));

        assertEquals("Sales for 2026-10-16 were AUD 125.50; gross profit is unavailable because sale cost data is incomplete. Source: Orithos POS report.",
                node.apply(state).get("answer"));
    }

    @Test
    void authoritativeSalesExplainsWhenProfitIsHiddenByCostPermission() {
        OverAllState state = state("", List.of(Map.of("sales", 125.50, "grossProfit", "",
                "costAvailable", false, "profitUnavailableReason", "permission", "transactions", 4)),
                "2026-10-16", "2026-10-16");
        when(state.value("intent", String.class)).thenReturn(Optional.of("report_sales"));
        assertEquals("Sales for 2026-10-16 were AUD 125.50; gross profit is unavailable because your account cannot view cost data. Source: Orithos POS report.",
                node.apply(state).get("answer"));
    }

    @Test
    void explicitDateComparisonReportsBothDatesAndAuthoritativeMetrics() {
        OverAllState state = state("", List.of(Map.of("comparison", true,
                "firstDate", "2026-10-14", "secondDate", "2026-10-15",
                "first", Map.of("sales", 100.00, "grossProfit", 30.00, "costAvailable", true, "transactions", 2),
                "second", Map.of("sales", 120.00, "grossProfit", 35.00, "costAvailable", true, "transactions", 3))),
                "2026-10-14", "2026-10-15");
        when(state.value("intent", String.class)).thenReturn(Optional.of("report_sales"));
        assertEquals("Sales on 2026-10-14 were AUD 100.00; sales on 2026-10-15 were AUD 120.00; gross profit was AUD 30.00 and AUD 35.00 (ex-GST sales less cost). Source: Orithos POS report.",
                node.apply(state).get("answer"));
    }

    @Test
    void comparisonDoesNotReportProfitWhenEitherCostCoverageIsIncomplete() {
        OverAllState state = state("", List.of(Map.of("comparison", true,
                "firstDate", "2026-10-14", "secondDate", "2026-10-15",
                "first", Map.of("sales", 100.00, "grossProfit", 30.00, "costAvailable", true, "transactions", 2),
                "second", Map.of("sales", 120.00, "grossProfit", "", "costAvailable", false, "transactions", 3))),
                "2026-10-14", "2026-10-15");
        when(state.value("intent", String.class)).thenReturn(Optional.of("report_sales"));
        assertEquals("Sales on 2026-10-14 were AUD 100.00; sales on 2026-10-15 were AUD 120.00. Gross profit comparison is unavailable because sale cost data is incomplete for at least one date. Source: Orithos POS report.",
                node.apply(state).get("answer"));
    }

    @Test
    void comparisonReportsNoDataWhenNeitherDateHasCompletedSales() {
        OverAllState state = state("", List.of(Map.of("comparison", true,
                "firstDate", "2026-10-14", "secondDate", "2026-10-15",
                "first", Map.of("sales", 0, "transactions", 0, "costAvailable", true),
                "second", Map.of("sales", 0, "transactions", 0, "costAvailable", true))),
                "2026-10-14", "2026-10-15");
        when(state.value("intent", String.class)).thenReturn(Optional.of("report_sales"));
        assertEquals("No completed sales were found on 2026-10-14 or 2026-10-15. Source: Orithos POS report.",
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
    void averageTicketSummaryIncludesAudAndNamesItsSalesTransactionCount() {
        OverAllState state = state("", List.of(Map.of("sales", 12.99, "tickets", 1, "aov", 12.99)));
        when(state.value("intent", String.class)).thenReturn(Optional.of("report_aov"));

        assertEquals("Average Ticket for 2026-10-20 is AUD 12.99 across 1 sale transaction. Source: Orithos POS report.",
                node.apply(state).get("answer"));
    }

    @Test
    void averageTicketSummaryFollowsChineseQuestionLanguage() {
        OverAllState state = state("", List.of(Map.of("sales", 5178.94, "tickets", 185, "aov", 27.99)),
                "2026-11-12", "2026-11-12");
        when(state.value("intent", String.class)).thenReturn(Optional.of("report_aov"));
        when(state.value("question", String.class)).thenReturn(Optional.of("昨天平均客单价是多少？"));

        assertEquals("2026-11-12平均客单价 AUD 27.99，基于 185 笔销售交易。数据来源：Orithos POS 报表。",
                node.apply(state).get("answer"));
    }

    @Test
    void emptyAverageTicketPeriodReportsNoSalesInChinese() {
        OverAllState state = state("", List.of(), "2026-11-11", "2026-11-11");
        when(state.value("intent", String.class)).thenReturn(Optional.of("report_aov"));
        when(state.value("question", String.class)).thenReturn(Optional.of("昨天平均客单价是多少？"));

        assertEquals("2026-11-11没有已完成销售记录。数据来源：Orithos POS 报表。",
                node.apply(state).get("answer"));
    }

    @Test
    void unavailableNativeDataIsNotReportedAsAnEmptyDay() {
        assertError("NATIVE_REPORT_UNAVAILABLE", "Orithos reporting is temporarily unavailable. Please try again.");
    }

    @Test
    void unavailableStockSourceOffersAReadOnlyFallbackInsteadOfSayingTheProductIsMissing() {
        OverAllState state = state("NATIVE_REPORT_UNAVAILABLE", List.of());
        when(state.value("intent", String.class)).thenReturn(Optional.of("report_stock"));

        assertEquals("I could not read Orithos stock data right now. Open the stock list to check manually, or try again shortly.",
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
    void deadStockAnswerDisclosesUnknownSalesFreshnessWhenRowsExist() {
        OverAllState state = state("", List.of(Map.of("name", "Wine", "on_hand", 3, "sold_qty", 0)),
                "2026-10-01", "2026-10-30");
        when(state.value("intent", String.class)).thenReturn(Optional.of("report_dead_stock"));
        when(state.value("question", String.class)).thenReturn(Optional.of("哪些商品滞销？"));
        when(state.value("report_data_status", String.class)).thenReturn(Optional.of("incomplete"));

        String answer = (String) node.apply(state).get("answer");

        org.junit.jupiter.api.Assertions.assertTrue(answer.contains("销售数据更新时间及完整性无法确认"));
        org.junit.jupiter.api.Assertions.assertTrue(answer.contains("需核实"));
    }

    @Test
    void emptyDeadStockResultDoesNotClaimNoItemsWhenSalesFreshnessIsUnknown() {
        OverAllState state = state("", List.of(), "2026-10-01", "2026-10-30");
        when(state.value("intent", String.class)).thenReturn(Optional.of("report_dead_stock"));
        when(state.value("question", String.class)).thenReturn(Optional.of("Any dead stock?"));
        when(state.value("report_data_status", String.class)).thenReturn(Optional.of("incomplete"));

        String answer = (String) node.apply(state).get("answer");

        org.junit.jupiter.api.Assertions.assertFalse(answer.startsWith("No dead-stock items found"));
        org.junit.jupiter.api.Assertions.assertTrue(answer.contains("Sales data freshness and completeness could not be confirmed"));
    }

    @Test
    void stockAnswerFollowsChineseQuestionLanguage() {
        OverAllState stock = state("", List.of(Map.of(
                "name", "Blickinstal Black on Black Shiraz 750ML", "quantity", 3)));
        when(stock.value("intent", String.class)).thenReturn(Optional.of("report_stock"));
        when(stock.value("question", String.class)).thenReturn(Optional.of("店里还有 Shiraz 吗？"));
        when(stock.value("slots")).thenReturn(Optional.of(Map.of(
                "query", "Shiraz", "from", "2026-11-13", "to", "2026-11-14")));

        assertEquals("Shiraz库存：Blickinstal Black on Black Shiraz 750ML 3（库存更新时间未知，请核实）",
                node.apply(stock).get("answer"));
    }

    @Test
    void stockAnswerShowsTheTrustedInventoryAsOfTime() {
        String product = "-196 LEMON P/F 6% 330ML";
        OverAllState stock = state("", List.of(Map.of(
                "name", product, "quantity", 100, "dataAsOf", "2026-11-19T06:15:00Z")));
        when(stock.value("intent", String.class)).thenReturn(Optional.of("report_stock"));
        when(stock.value("question", String.class)).thenReturn(Optional.of("How much stock is left?"));
        when(stock.value("slots")).thenReturn(Optional.of(Map.of("query", product)));

        assertEquals(product + ": 100 (inventory updated: 2026-11-19T06:15:00Z)",
                node.apply(stock).get("answer"));
    }

    @Test
    void stockAnswerLabelsMissingInventoryAsOfAsUnknown() {
        String product = "-196 LEMON P/F 6% 330ML";
        OverAllState stock = state("", List.of(Map.of("name", product, "quantity", 100)));
        when(stock.value("intent", String.class)).thenReturn(Optional.of("report_stock"));
        when(stock.value("question", String.class)).thenReturn(Optional.of("还剩多少库存？"));
        when(stock.value("slots")).thenReturn(Optional.of(Map.of("query", product)));

        assertEquals(product + "库存：100（库存更新时间未知，请核实）",
                node.apply(stock).get("answer"));
    }

    @Test
    void exactEnglishStockLookupDoesNotRepeatTheProductName() {
        String product = "-196 LEMON P/F 6% 330ML";
        OverAllState stock = state("", List.of(Map.of("name", product, "quantity", 100)));
        when(stock.value("intent", String.class)).thenReturn(Optional.of("report_stock"));
        when(stock.value("question", String.class)).thenReturn(Optional.of("How many are in stock?"));
        when(stock.value("slots")).thenReturn(Optional.of(Map.of("query", product)));

        assertEquals(product + ": 100 (inventory update time unknown; verify before relying on it)",
                node.apply(stock).get("answer"));
    }

    @Test
    void exactChineseStockLookupDoesNotRepeatTheProductName() {
        String product = "-196 LEMON P/F 6% 330ML";
        OverAllState stock = state("", List.of(Map.of("name", product, "quantity", 100)));
        when(stock.value("intent", String.class)).thenReturn(Optional.of("report_stock"));
        when(stock.value("question", String.class)).thenReturn(Optional.of("该商品还剩多少库存？"));
        when(stock.value("slots")).thenReturn(Optional.of(Map.of("query", product)));

        assertEquals(product + "库存：100（库存更新时间未知，请核实）", node.apply(stock).get("answer"));
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

        org.junit.jupiter.api.Assertions.assertTrue(answer.contains("已知成本库存小计 AUD 550.00"));
        org.junit.jupiter.api.Assertions.assertTrue(answer.contains("前 8 个商品小计 AUD 360.00"));
        org.junit.jupiter.api.Assertions.assertTrue(answer.contains("完整库存金额暂不可用"));
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
    void stockValueWithNoTrustedCostCoverageDoesNotReportZeroAsStoreValue() {
        Map<String, Object> summary = new java.util.HashMap<>();
        summary.put("name", "Uncosted wine");
        summary.put("inventory_value", null);
        summary.put("store_inventory_value_total", BigDecimal.ZERO);
        summary.put("valued_product_count", 0);
        summary.put("excluded_product_count", 3055);
        OverAllState stockValue = state("", List.of(summary));
        when(stockValue.value("intent", String.class)).thenReturn(Optional.of("report_stock_value"));
        when(stockValue.value("question", String.class)).thenReturn(Optional.of("当前库存占了多少钱？"));

        String answer = (String) node.apply(stockValue).get("answer");

        org.junit.jupiter.api.Assertions.assertTrue(answer.contains("没有可验证的商品成本"));
        org.junit.jupiter.api.Assertions.assertTrue(answer.contains("3055"));
        org.junit.jupiter.api.Assertions.assertFalse(answer.contains("AUD 0.00"));
    }

    @Test
    void stockValueDoesNotListUncostedProductsAsZeroValueLeaders() {
        Map<String, Object> uncosted = new java.util.HashMap<>();
        uncosted.put("name", "Uncosted wine");
        uncosted.put("inventory_value", null);
        uncosted.put("store_inventory_value_total", BigDecimal.TEN);
        uncosted.put("valued_product_count", 1);
        uncosted.put("excluded_product_count", 1);
        OverAllState stockValue = state("", List.of(uncosted));
        when(stockValue.value("intent", String.class)).thenReturn(Optional.of("report_stock_value"));
        when(stockValue.value("question", String.class)).thenReturn(Optional.of("Which inventory ties up cash?"));

        String answer = (String) node.apply(stockValue).get("answer");

        org.junit.jupiter.api.Assertions.assertFalse(answer.contains("Uncosted wine AUD 0.00"));
        org.junit.jupiter.api.Assertions.assertTrue(answer.contains("Known-cost on-hand inventory subtotal"));
    }

    @Test
    void missingOutletAndPermissionHaveDistinctGuidance() {
        assertError("NO_OUTLET", "Your account is not bound to a store.");
        assertError("NO_PERMISSION", "You do not have permission to query reports.");
    }

    @Test
    void unsupportedAndOversizedReportsAskForSupportedNarrowerQueries() {
        assertError("NATIVE_REPORT_UNSUPPORTED",
                "That custom report is not supported. You can compare sales on two explicit dates, for example: "
                        + "Compare sales on 14 Oct 2026 with 15 Oct 2026.");
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
