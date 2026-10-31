package com.orithos.modules.ai.replenishment;

import com.orithos.modules.ai.report.TenantContext;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
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
        assertTrue(text.contains("\n• VB Cans — order 24 (≈3.0d left)"));
        assertTrue(text.contains("\n• Shiraz — order 12"));
        assertTrue(text.contains("\n\nTap below to review quantities"));
        assertFalse(text.contains("Opening the requested workflow"));
    }

    @Test
    void briefFormatsChineseSuggestionsWithTheSameSourceValues() {
        OdooReplenishmentClient client = mock(OdooReplenishmentClient.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.plan(tenant)).thenReturn(new ReplenishmentPlan(
                21, 5, List.of(new ReplenishmentSuggestion(1, "Shiraz", "Units", 12, 5.0, 1.0))));

        String text = new ReplenishmentChatBrief(client).brief("哪些商品需要补货？", tenant);

        assertTrue(text.contains("建议补货（覆盖 21 天）：5 个商品需要补货。"));
        assertTrue(text.contains("\n• Shiraz — 建议订购 12（约剩 5.0 天）"));
        assertTrue(text.contains("打开补货页面审核数量并确认订单。"));
    }

    @Test
    void briefMarksMissingPlanUnavailableAndOffersRetry() {
        OdooReplenishmentClient client = mock(OdooReplenishmentClient.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.plan(tenant)).thenReturn(null);

        String text = new ReplenishmentChatBrief(client).brief("补货建议", tenant);

        assertTrue(text.contains("暂不可用"));
        assertTrue(text.contains("重试"));

        String missingTenant = new ReplenishmentChatBrief(client).brief("补货建议", null);
        assertTrue(missingTenant.contains("暂不可用"));
        verify(client, times(1)).plan(tenant);
    }

    @Test
    void briefMarksClientFailureUnavailableAndOffersRetry() {
        OdooReplenishmentClient client = mock(OdooReplenishmentClient.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.plan(tenant)).thenThrow(new IllegalStateException("upstream unavailable"));

        String text = new ReplenishmentChatBrief(client).brief("What should I restock?", tenant);

        assertTrue(text.toLowerCase().contains("unavailable"));
        assertTrue(text.toLowerCase().contains("retry"));
    }

    @Test
    void briefMarksChineseClientFailureUnavailableInChinese() {
        OdooReplenishmentClient client = mock(OdooReplenishmentClient.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.plan(tenant)).thenThrow(new IllegalStateException("upstream unavailable"));

        String text = new ReplenishmentChatBrief(client).brief("给我补货建议", tenant);

        assertTrue(text.contains("暂不可用"));
        assertTrue(text.contains("重试"));
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
        assertTrue(plan.top().get(0).onHand() == 2);
        assertTrue(plan.top().get(0).forecastAvailable() == 2);
    }

    @Test
    void missingInventoryIsReportedInsteadOfBeingTreatedAsZero() {
        List<Map<String, Object>> products = List.of(Map.of(
                "id", 11,
                "display_name", "Unknown Stock Product",
                "uom_id", List.of(1, "Units")));

        ReplenishmentPlan plan = OdooReplenishmentClient.fromMaps(
                products, Map.of(11L, 28d), Map.of(), 21);

        assertTrue(plan.top().isEmpty());
        assertTrue("DATA_INCOMPLETE".equals(plan.dataQualityStatus()));
        assertTrue(plan.dataGaps().stream().anyMatch(gap -> gap.contains("inventory unavailable")));
    }
}
