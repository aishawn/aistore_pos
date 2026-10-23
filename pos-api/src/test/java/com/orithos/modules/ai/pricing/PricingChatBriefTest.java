package com.orithos.modules.ai.pricing;

import com.orithos.modules.ai.report.TenantContext;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PricingChatBriefTest {

    @Test
    void briefListsRaiseSuggestionsAndCta() {
        OdooPriceSuggestionClient client = mock(OdooPriceSuggestionClient.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.review(tenant)).thenReturn(new PriceReviewBrief(
                0.30,
                List.of(new PriceReviewItem(1, "Shiraz Reserve", 8, 24.99, 27.95, "raise"))));

        String text = new PricingChatBrief(client).brief("Which prices to review?", tenant);

        assertTrue(text.contains("Prices that need review"));
        assertTrue(text.contains("\n• Shiraz Reserve — $24.99 → suggest $27.95"));
        assertTrue(text.contains("\n\nTap below to open price review"));
        assertTrue(text.contains("Staff confirm"));
    }

    @Test
    void briefFormatsChineseSuggestionsAndPreservesPriceValues() {
        OdooPriceSuggestionClient client = mock(OdooPriceSuggestionClient.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.review(tenant)).thenReturn(new PriceReviewBrief(
                0.30, List.of(new PriceReviewItem(1, "Shiraz Reserve", 8, 24.99, 27.95, "raise"))));

        String text = new PricingChatBrief(client).brief("哪些价格需要复核？", tenant);

        assertTrue(text.contains("以下价格需要复核（目标净毛利约 30%）："));
        assertTrue(text.contains("\n• Shiraz Reserve — $24.99 → 建议 $27.95"));
        assertTrue(text.contains("任何价格变更都需要员工在页面确认"));
    }

    @Test
    void briefMarksMissingOrFailedReviewUnavailableWithRetry() {
        OdooPriceSuggestionClient client = mock(OdooPriceSuggestionClient.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.review(tenant)).thenReturn(null);

        String missing = new PricingChatBrief(client).brief("Which prices need review?", tenant);
        String missingTenant = new PricingChatBrief(client).brief("Which prices need review?", null);

        assertTrue(missing.toLowerCase().contains("unavailable"));
        assertTrue(missing.toLowerCase().contains("retry"));
        assertTrue(missingTenant.toLowerCase().contains("unavailable"));
        verify(client, times(1)).review(tenant);

        when(client.review(tenant)).thenThrow(new IllegalStateException("upstream unavailable"));
        String failed = new PricingChatBrief(client).brief("Which prices need review?", tenant);
        assertTrue(failed.toLowerCase().contains("unavailable"));
        assertTrue(failed.toLowerCase().contains("retry"));
    }

    @Test
    void briefMarksChineseMissingTenantUnavailableInChinese() {
        OdooPriceSuggestionClient client = mock(OdooPriceSuggestionClient.class);

        String text = new PricingChatBrief(client).brief("哪些价格需要复核？", null);

        assertTrue(text.contains("暂不可用"));
        assertTrue(text.contains("重试"));
    }

    @Test
    void suggestedListPriceMatchesGstInclusiveRounding() {
        SuggestionTax gst = new SuggestionTax(1, 10, "percent", true, false);
        Double suggested = PriceSuggestionMath.suggestedListPrice(10.0, 0.30, List.of(gst));
        assertNotNull(suggested);
        // net = 10/0.7 ≈ 14.2857; shelf = *1.1 ≈ 15.714; ceil to 0.05 → 15.75
        assertEquals(15.75, suggested, 0.001);
    }

    @Test
    void buildReviewItemsFlagsBelowMarginAsRaise() {
        SuggestionTax gst = new SuggestionTax(7, 10, "percent", true, false);
        Map<String, Object> product = Map.of(
                "id", 3,
                "display_name", "Cheap Red",
                "list_price", 12.0,
                "standard_price", 10.0,
                "taxes_id", List.of(7L));
        List<PriceReviewItem> items = OdooPriceSuggestionClient.buildReviewItems(
                List.of(product), Map.of(3L, 5d), Map.of(7L, gst), 0.30);

        assertEquals(1, items.size());
        assertEquals("raise", items.get(0).status());
        assertNotNull(items.get(0).suggestedPrice());
        assertTrue(items.get(0).suggestedPrice() > items.get(0).currentPrice());
    }
}
