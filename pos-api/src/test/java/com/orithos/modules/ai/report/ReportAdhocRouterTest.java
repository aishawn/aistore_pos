package com.orithos.modules.ai.report;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ReportAdhocRouterTest {

    @Test
    void ticketCountMapsToAverageTicketTemplate() {
        assertEquals("report_aov",
                ReportAdhocRouter.maybeOverride("昨天有几笔订单", "report_qty"));
        assertEquals("report_aov",
                ReportAdhocRouter.maybeOverride("how many tickets yesterday", "report_sales"));
        assertEquals("report_aov",
                ReportAdhocRouter.maybeOverride("How many transactions did we have today?", "report_adhoc"));
        assertFalse(ReportAdhocRouter.shouldUseNl2Sql("how many tickets yesterday"));
    }

    @Test
    void salesAndTicketCountQuestionsUseTheSalesReportWhileAverageTicketStaysSpecific() {
        for (String question : new String[]{
                "What were yesterday's sales, gross profit and transaction count?",
                "What were yesterday's sales and transaction count?",
                "昨天销售额、毛利和交易笔数是多少？"
        }) {
            assertEquals("report_sales", ReportAdhocRouter.maybeOverride(question, "report_aov"), question);
        }
        assertEquals("report_aov", ReportAdhocRouter.maybeOverride(
                "What was the average ticket and transaction count yesterday?", "report_sales"));
    }

    @Test
    void mixedAndProductRankForceAdhocButCategoryRankUsesNativeTemplate() {
        assertTrue(ReportAdhocRouter.shouldUseNl2Sql("上周五啤酒的销量和金额分别是多少"));
        assertTrue(ReportAdhocRouter.shouldUseNl2Sql("上周哪个商品卖得最多"));
        assertFalse(ReportAdhocRouter.shouldUseNl2Sql("本周哪类商品卖得最好"));
        assertFalse(ReportAdhocRouter.shouldUseNl2Sql("Which category sold best this week?"));
        assertEquals("report_top_category",
                ReportAdhocRouter.maybeOverride("本周哪类商品卖得最好", "report_adhoc"));
        assertEquals("report_top_category",
                ReportAdhocRouter.maybeOverride("Which category sold best this week?", "report_qty"));
        assertEquals("report_top_category",
                ReportAdhocRouter.maybeOverride("Top-selling categories this week", "report_qty"));
        assertEquals("report_adhoc",
                ReportAdhocRouter.maybeOverride("Which product sold most this week?", "report_qty"));
        assertEquals("report_adhoc",
                ReportAdhocRouter.maybeOverride("Which category sold best? DROP TABLE sale", "report_qty"));
        assertEquals("report_adhoc",
                ReportAdhocRouter.maybeOverride("What did we sell most this week?", "report_qty"));
        assertEquals("report_sales", ReportAdhocRouter.maybeOverride(
                "Compare sales on 14 Oct with 15 Oct", "report_adhoc"));
        assertEquals("report_sales", ReportAdhocRouter.maybeOverride(
                "比较 10月14日和10月15日销售额", "report_adhoc"));
        assertEquals("report_adhoc", ReportAdhocRouter.maybeOverride("Compare last week with this week", "report_sales"));
        assertEquals("report_adhoc", ReportAdhocRouter.maybeOverride(
                "Compare sales and units on 14 Oct with 15 Oct", "report_sales"));
        assertEquals("report_adhoc", ReportAdhocRouter.maybeOverride(
                "Compare stock on 14 Oct with 15 Oct", "report_sales"));
        assertEquals("report_adhoc",
                ReportAdhocRouter.maybeOverride("Give me sales and units for yesterday", "report_qty"));
    }

    @Test
    void supportedExplicitDateSalesComparisonsBypassAdhocGate() {
        for (String question : new String[]{
                "Compare sales on 14 Oct 2026 with 15 Oct 2026",
                "比较2026年10月14日和2026年10月15日销售额"
        }) {
            assertFalse(ReportAdhocRouter.shouldUseNl2Sql(question), question);
            assertEquals("report_sales", ReportAdhocRouter.maybeOverride(question, "report_adhoc"), question);
        }
        assertTrue(ReportAdhocRouter.shouldUseNl2Sql("Compare sales last week with this week"));
        assertTrue(ReportAdhocRouter.shouldUseNl2Sql("Compare sales and units on 14 Oct with 15 Oct"));
    }

    @Test
    void plainQtyStaysOnTemplate() {
        assertFalse(ReportAdhocRouter.shouldUseNl2Sql("昨天销量"));
        assertEquals("report_qty",
                ReportAdhocRouter.maybeOverride("上周五啤酒类卖了多少", "report_qty"));
    }

    @Test
    void aggregateStockQuestionsUseTheAuthoritativeSummaryWithoutCapturingProductLookups() {
        for (String question : new String[]{
                "当前库存有多少件？", "有多少商品库存是负数？", "库存总量是多少",
                "How many units are in stock?", "How many products have negative stock?",
                "What is our total inventory?"
        }) {
            assertFalse(ReportAdhocRouter.shouldUseNl2Sql(question), question);
            assertEquals("report_stock_summary", ReportAdhocRouter.maybeOverride(question, "product_count"), question);
        }
        assertEquals("report_stock", ReportAdhocRouter.maybeOverride("How much stock does Shiraz have?", "report_stock"));
        assertEquals("report_stock", ReportAdhocRouter.maybeOverride("库存 Shiraz 有多少？", "report_stock"));
    }

    @Test
    void grossProfitQuestionsUseTheAuthoritativeSalesReportPath() {
        for (String question : new String[]{"昨天利润如何？", "昨天销量如何？利润如何？",
                "昨天销售额如何？利润如何？", "昨天毛利多少",
                "What was profit yesterday?", "What were sales and profit yesterday?", "Show margin this week"}) {
            assertEquals("report_sales", ReportAdhocRouter.maybeOverride(question, "report_adhoc"), question);
            assertFalse(ReportAdhocRouter.shouldUseNl2Sql(question), question);
        }
    }

    @Test
    void invoiceAndSupplierSpendQuestionsStayInReporting() {
        assertTrue(ReportAdhocRouter.shouldUseNl2Sql("How many invoices did we receive?"));
        assertTrue(ReportAdhocRouter.shouldUseNl2Sql("How much did we pay suppliers this month?"));
        assertTrue(ReportAdhocRouter.shouldUseNl2Sql("How much did we pay for this invoice?"));
        assertTrue(ReportAdhocRouter.shouldUseNl2Sql("What did we spend on supplier bills last month?"));
        assertEquals("report_adhoc",
                ReportAdhocRouter.maybeOverride("How many invoices did we receive?", "navigate"));
        assertEquals("report_adhoc",
                ReportAdhocRouter.maybeOverride("供应商付款总额是多少", "navigate"));
        assertEquals("report_adhoc",
                ReportAdhocRouter.maybeOverride("How much did we pay for this invoice?", "navigate"));
    }

    @Test
    void purchaseHistoryAndSpendQuestionsDoNotOpenCurrentWorkflowPages() {
        for (String question : new String[]{
                "How much did we spend on purchases last month?",
                "What was our purchase history last week?",
                "What did we spend on replenishment last week?",
                "上个月采购花了多少钱",
                "上周采购记录是什么",
                "本月补货花了多少钱"
        }) {
            assertTrue(ReportAdhocRouter.shouldUseNl2Sql(question), question);
            assertEquals("report_adhoc", ReportAdhocRouter.maybeOverride(question, "navigate"), question);
        }

        for (String question : new String[]{
                "What should I purchase?",
                "What should I reorder today?",
                "How much should I charge for Shiraz?",
                "Show me the price suggestions"
        }) {
            assertFalse(ReportAdhocRouter.shouldUseNl2Sql(question), question);
        }
    }

    @Test
    void pricingHistoryQuestionsStayOutOfThePricingWorkflow() {
        for (String question : new String[]{
                "Show me the pricing report for yesterday",
                "Show me last week's pricing history",
                "Show me the price history for yesterday",
                "Show me the price suggestions from last week",
                "上周的价格建议有哪些",
                "昨天的定价报告",
                "上周价格历史",
                "昨天价格历史"
        }) {
            assertTrue(ReportAdhocRouter.shouldUseNl2Sql(question), question);
            assertEquals("report_adhoc", ReportAdhocRouter.maybeOverride(question, "navigate"), question);
        }
        assertFalse(ReportAdhocRouter.shouldUseNl2Sql("Can you review prices for Shiraz?"));
        assertFalse(ReportAdhocRouter.shouldUseNl2Sql("Show me the price suggestions"));
        assertFalse(ReportAdhocRouter.shouldUseNl2Sql("给我看看价格建议"));
    }

    @Test
    void rawSqlStatementsAreRejectedByTheUnsupportedQueryGate() {
        for (String question : new String[]{
                "SELECT * FROM sale",
                "Run SQL: SELECT id, total FROM sale WHERE outlet_id = 1",
                "Please execute SELECT name FROM product"
        }) {
            assertTrue(ReportAdhocRouter.shouldUseNl2Sql(question), question);
            assertEquals("report_adhoc", ReportAdhocRouter.maybeOverride(question, "unknown"), question);
        }
    }
}
