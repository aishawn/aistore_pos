package com.orithos.modules.ai;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

class AssistantFastPathRouterTest {

    @Test
    void routesCommonReadOnlyReportRangesWithoutTheClassifier() {
        assertEquals("report_sales", AssistantFastPathRouter.maybeMatch("sales last 7 days").intent());
        assertEquals("report_sales", AssistantFastPathRouter.maybeMatch("昨天销售额").intent());
        assertEquals("report_qty", AssistantFastPathRouter.maybeMatch("units sold past 30 days").intent());
        assertEquals("report_qty", AssistantFastPathRouter.maybeMatch("最近7天销量").intent());
    }

    @Test
    void matchesTodaySalesWithoutLlm() {
        AssistantFastPathRouter.Match match = AssistantFastPathRouter.maybeMatch("Today's sales");
        assertNotNull(match);
        assertEquals("report_sales", match.intent());
        assertEquals("Today's sales", match.summary());
    }

    @Test
    void matchesNavigationShortcuts() {
        assertEquals("navigate", AssistantFastPathRouter.maybeMatch("Open sell").intent());
        assertEquals("/", AssistantFastPathRouter.maybeMatch("Open sell").route());
        assertEquals("search_product", AssistantFastPathRouter.maybeMatch("Look up products").intent());
        assertEquals("/stock/list", AssistantFastPathRouter.maybeMatch("Check stock").route());
        assertEquals("/stock/list", AssistantFastPathRouter.maybeMatch("查询库存").route());
    }

    @Test
    void leavesComplexQuestionsForClassifier() {
        assertNull(AssistantFastPathRouter.maybeMatch("How much red wine sold this week?"));
        assertNull(AssistantFastPathRouter.maybeMatch(null));
    }
}
