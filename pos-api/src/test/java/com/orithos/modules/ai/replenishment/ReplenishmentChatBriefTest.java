package com.orithos.modules.ai.replenishment;

import com.orithos.modules.ai.report.TenantContext;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ReplenishmentChatBriefTest {

    @Test
    void briefListsTopSuggestionsAndCta() {
        OdooReplenishmentClient client = mock(OdooReplenishmentClient.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.plan(tenant)).thenReturn(new ReplenishmentPlan(
                21,
                5,
                List.of(
                        new ReplenishmentSuggestion(1, "VB Cans", "Units", 24, 3.0, 2.0),
                        new ReplenishmentSuggestion(2, "Shiraz", "Units", 12, 5.0, 1.0))));

        String text = new ReplenishmentChatBrief(client).brief("What should I restock?", tenant);

        assertTrue(text.contains("Top restock suggestions (21d cover): 5 items need order."));
        assertTrue(text.contains("VB Cans — order 24 (≈3.0d left)"));
        assertTrue(text.contains("Shiraz — order 12"));
        assertTrue(text.contains("Tap below to review quantities"));
        assertFalse(text.contains("Opening the requested workflow"));
    }

    @Test
    void briefSoftFallsBackWhenPlanUnavailable() {
        OdooReplenishmentClient client = mock(OdooReplenishmentClient.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.plan(tenant)).thenReturn(null);

        String text = new ReplenishmentChatBrief(client).brief("补货建议", tenant);

        assertTrue(text.toLowerCase().contains("replenishment"));
        assertTrue(text.toLowerCase().contains("tap below"));
    }

    @Test
    void planMathMatchesWeightedVelocity() {
        List<Map<String, Object>> products = List.of(Map.of(
                "id", 10,
                "display_name", "Lager Case",
                "qty_available", 2,
                "virtual_available", 2,
                "uom_id", List.of(1, "Units")));
        // recent 28d = 28 units → 1/day; previous 0 → unitsPerDay = 1
        // need 21, forecast 2 → suggest 19
        ReplenishmentPlan plan = OdooReplenishmentClient.fromMaps(
                products, Map.of(10L, 28d), Map.of(), 21);

        assertTrue(plan.itemsNeedingOrder() == 1);
        assertTrue(plan.top().get(0).suggestedQuantity() == 19);
        assertTrue(plan.top().get(0).name().contains("Lager"));
    }
}
