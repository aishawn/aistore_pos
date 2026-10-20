package com.orithos.modules.ai;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class WorkflowRouteRouterTest {

    @Test
    void routesExplicitWorkflowRequestsWithoutDependingOnModelIntent() {
        assertRoute("What should I reorder today?", "/stock/replenishment");
        assertRoute("What should we buy before the weekend?", "/stock/replenishment");
        assertRoute("Which products need reordering?", "/stock/replenishment");
        assertRoute("哪些商品库存低", "/stock/replenishment");
        assertRoute("Show me the suggested purchase lines", "/stock/replenishment");
        assertRoute("库存预警有哪些", "/stock/replenishment");
        assertRoute("帮我看看哪些商品需要调价", "/stock/capped-pricing");
        assertRoute("Can you review prices for me?", "/stock/capped-pricing");
        assertRoute("What should I charge for Shiraz?", "/stock/capped-pricing");
        assertRoute("Recommend a red wine under $30", "/sommelier");
        assertRoute("Suggest a wine for dinner", "/sommelier");
        assertRoute("Find me a wine for steak", "/sommelier");
        assertRoute("What wine goes with steak?", "/sommelier");
        assertRoute("识别这张发票", "/invoices/scan");
        assertRoute("Upload this supplier bill", "/invoices/scan");
        assertRoute("上传供应商发票", "/invoices/scan");
    }

    @Test
    void leavesUnrelatedQuestionsUntouched() {
        assertNull(WorkflowRouteRouter.maybeOverride("What did we sell most this week?"));
        assertNull(WorkflowRouteRouter.maybeOverride("How much stock is left?"));
        assertNull(WorkflowRouteRouter.maybeOverride("How much red wine sold this week?"));
        assertNull(WorkflowRouteRouter.maybeOverride("How much did we pay suppliers this month?"));
        assertNull(WorkflowRouteRouter.maybeOverride("What was our wine revenue yesterday?"));
        assertNull(WorkflowRouteRouter.maybeOverride("How many invoices did we receive?"));
    }

    @Test
    void handlesCaseAndPunctuationWithoutChangingRoutes() {
        assertRoute("  REORDER, please!  ", "/stock/replenishment");
        assertRoute("PRICE REVIEW?", "/stock/capped-pricing");
        assertRoute("推荐适合聚会的白葡萄酒。", "/sommelier");
        assertRoute("请识别这张发票。", "/invoices/scan");
    }

    @Test
    void ignoresBlankQuestions() {
        assertNull(WorkflowRouteRouter.maybeOverride(null));
        assertNull(WorkflowRouteRouter.maybeOverride("   "));
    }

    private static void assertRoute(String question, String route) {
        WorkflowRouteRouter.Override override = WorkflowRouteRouter.maybeOverride(question);
        assertEquals("navigate", override.intent());
        assertEquals(route, override.route());
    }
}
