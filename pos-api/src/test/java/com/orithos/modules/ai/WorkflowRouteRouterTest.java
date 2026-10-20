package com.orithos.modules.ai;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class WorkflowRouteRouterTest {

    @Test
    void routesExplicitWorkflowRequestsWithoutDependingOnModelIntent() {
        assertRoute("What should I reorder today?", "/stock/replenishment");
        assertRoute("帮我看看哪些商品需要调价", "/stock/capped-pricing");
        assertRoute("Recommend a red wine under $30", "/sommelier");
        assertRoute("识别这张发票", "/invoices/scan");
    }

    @Test
    void leavesUnrelatedQuestionsUntouched() {
        assertNull(WorkflowRouteRouter.maybeOverride("What did we sell most this week?"));
        assertNull(WorkflowRouteRouter.maybeOverride("How much stock is left?"));
    }

    private static void assertRoute(String question, String route) {
        WorkflowRouteRouter.Override override = WorkflowRouteRouter.maybeOverride(question);
        assertEquals("navigate", override.intent());
        assertEquals(route, override.route());
    }
}
