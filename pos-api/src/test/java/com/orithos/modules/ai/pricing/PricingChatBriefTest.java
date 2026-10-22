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
