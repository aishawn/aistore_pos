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
    void routesCategoryQuantityQuestionsWithTheirCategorySlot() {
        assertEquals("red wine",
                AssistantFastPathRouter.maybeMatch("How much red wine sold this week?").slots().get("category"));
        assertEquals("啤酒",
                AssistantFastPathRouter.maybeMatch("本周啤酒卖了多少").slots().get("category"));
    }

    @Test
    void routesExplicitDateSalesQuestionsWithoutTheClassifier() {
        assertEquals("report_sales", AssistantFastPathRouter.maybeMatch("14,oct sales").intent());
        assertEquals("report_sales", AssistantFastPathRouter.maybeMatch("sales on 14 October 2026").intent());
        assertEquals("report_sales", AssistantFastPathRouter.maybeMatch("2026-10-14 sales").intent());
        assertEquals("report_sales", AssistantFastPathRouter.maybeMatch("10月14日销售额").intent());
    }

    @Test
    void routesNamedProductSearchAndStockQuestionsWithoutTheClassifier() {
        AssistantFastPathRouter.Match product = AssistantFastPathRouter.maybeMatch("look up product DEMO");
        assertEquals("search_product", product.intent());
        assertEquals("DEMO", product.slots().get("query"));

        AssistantFastPathRouter.Match naturalProduct = AssistantFastPathRouter.maybeMatch("Search for the product VB Cans");
        assertEquals("search_product", naturalProduct.intent());
        assertEquals("VB Cans", naturalProduct.slots().get("query"));

        AssistantFastPathRouter.Match chineseProduct = AssistantFastPathRouter.maybeMatch("帮我搜一下 Shiraz");
        assertEquals("search_product", chineseProduct.intent());
        assertEquals("Shiraz", chineseProduct.slots().get("query"));

        AssistantFastPathRouter.Match stock = AssistantFastPathRouter.maybeMatch("How much Carlton Draught is in stock?");
        assertEquals("report_stock", stock.intent());
        assertEquals("Carlton Draught", stock.slots().get("query"));

        AssistantFastPathRouter.Match chineseStock = AssistantFastPathRouter.maybeMatch("查一下 VB Cans 库存");
        assertEquals("report_stock", chineseStock.intent());
        assertEquals("VB Cans", chineseStock.slots().get("query"));

        AssistantFastPathRouter.Match stockLevel = AssistantFastPathRouter.maybeMatch("What's the stock level for VB Cans?");
        assertEquals("report_stock", stockLevel.intent());
        assertEquals("VB Cans", stockLevel.slots().get("query"));

        AssistantFastPathRouter.Match quantity = AssistantFastPathRouter.maybeMatch("How many Carlton Draught do we have in stock?");
        assertEquals("report_stock", quantity.intent());
        assertEquals("Carlton Draught", quantity.slots().get("query"));

        AssistantFastPathRouter.Match reverseChinese = AssistantFastPathRouter.maybeMatch("VB Cans库存还有多少？");
        assertEquals("report_stock", reverseChinese.intent());
        assertEquals("VB Cans", reverseChinese.slots().get("query"));
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
    void leavesUnsupportedQuestionsForClassifier() {
        assertEquals("report_qty", AssistantFastPathRouter.maybeMatch("How much red wine sold this week?").intent());
        assertEquals("red wine", AssistantFastPathRouter.maybeMatch("How much red wine sold this week?").slots().get("category"));
        assertNull(AssistantFastPathRouter.maybeMatch("Why are sales down today?"));
        assertNull(AssistantFastPathRouter.maybeMatch(null));
    }
}
