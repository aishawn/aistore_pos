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
    void mixedAndRankForceAdhoc() {
        assertTrue(ReportAdhocRouter.shouldUseNl2Sql("上周五啤酒的销量和金额分别是多少"));
        assertTrue(ReportAdhocRouter.shouldUseNl2Sql("上周哪个商品卖得最多"));
        assertTrue(ReportAdhocRouter.shouldUseNl2Sql("本周哪类商品卖得最好"));
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
    void plainQtyStaysOnTemplate() {
        assertFalse(ReportAdhocRouter.shouldUseNl2Sql("昨天销量"));
        assertEquals("report_qty",
                ReportAdhocRouter.maybeOverride("上周五啤酒类卖了多少", "report_qty"));
    }

    @Test
    void grossProfitQuestionsUseTheAuthoritativeSalesReportPath() {
        for (String question : new String[]{"昨天利润如何？", "昨天销量如何？利润如何？", "昨天毛利多少",
                "What was profit yesterday?", "Show margin this week"}) {
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
}
