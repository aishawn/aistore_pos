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
        assertFalse(ReportAdhocRouter.shouldUseNl2Sql("how many tickets yesterday"));
    }

    @Test
    void mixedAndRankForceAdhoc() {
        assertTrue(ReportAdhocRouter.shouldUseNl2Sql("上周五啤酒的销量和金额分别是多少"));
        assertTrue(ReportAdhocRouter.shouldUseNl2Sql("上周哪个商品卖得最多"));
        assertTrue(ReportAdhocRouter.shouldUseNl2Sql("本周哪类商品卖得最好"));
        assertEquals("report_adhoc",
                ReportAdhocRouter.maybeOverride("What did we sell most this week?", "report_qty"));
        assertTrue(ReportAdhocRouter.shouldUseNl2Sql("Compare sales on 14 Oct with 15 Oct"));
        assertTrue(ReportAdhocRouter.shouldUseNl2Sql("比较 10月14日和10月15日销售额"));
    }

    @Test
    void plainQtyStaysOnTemplate() {
        assertFalse(ReportAdhocRouter.shouldUseNl2Sql("昨天销量"));
        assertEquals("report_qty",
                ReportAdhocRouter.maybeOverride("上周五啤酒类卖了多少", "report_qty"));
    }

    @Test
    void invoiceAndSupplierSpendQuestionsStayInReporting() {
        assertTrue(ReportAdhocRouter.shouldUseNl2Sql("How many invoices did we receive?"));
        assertTrue(ReportAdhocRouter.shouldUseNl2Sql("How much did we pay suppliers this month?"));
        assertEquals("report_adhoc",
                ReportAdhocRouter.maybeOverride("How many invoices did we receive?", "navigate"));
        assertEquals("report_adhoc",
                ReportAdhocRouter.maybeOverride("供应商付款总额是多少", "navigate"));
    }
}
