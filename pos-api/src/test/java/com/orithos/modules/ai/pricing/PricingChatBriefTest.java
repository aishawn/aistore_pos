package com.orithos.modules.ai.pricing;

import com.orithos.modules.ai.report.TenantContext;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class PricingChatBriefTest {

    @Test
    void briefListsRaiseSuggestionsAndCta() {
        NativePriceSuggestionService client = mock(NativePriceSuggestionService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.review(tenant)).thenReturn(new PriceReviewBrief(
                0.30,
                List.of(new PriceReviewItem(1, "Shiraz Reserve", 8, 24.99, 27.95, "raise"))));

        String text = new PricingChatBrief(client).brief("Which prices to review?", tenant);

        assertTrue(text.contains("Prices that need review"));
        assertTrue(text.contains("\n• Shiraz Reserve — $24.99 → suggest $27.95"));
        assertTrue(text.contains("Tap below to open price review"));
        assertTrue(text.contains("Staff confirm"));
    }

    @Test
    void briefFormatsChineseSuggestionsAndPreservesPriceValues() {
        NativePriceSuggestionService client = mock(NativePriceSuggestionService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.review(tenant)).thenReturn(new PriceReviewBrief(
                0.30, List.of(new PriceReviewItem(1, "Shiraz Reserve", 8, 24.99, 27.95, "raise"))));

        String text = new PricingChatBrief(client).brief("哪些价格需要复核？", tenant);

        assertTrue(text.contains("以下价格需要复核（目标净毛利约 30%）："));
        assertTrue(text.contains("\n• Shiraz Reserve — $24.99 → 建议 $27.95"));
        assertTrue(text.contains("任何价格变更都需要员工在页面确认"));
    }

    @Test
    void fairPriceQuestionUsesOnlyTheRequestedProduct() {
        NativePriceSuggestionService client = mock(NativePriceSuggestionService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.review(tenant, "Shiraz")).thenReturn(new PriceReviewBrief(
                0.30, List.of(new PriceReviewItem(1, "Barossa Shiraz", 8, 24.99, 27.95, "raise")), 2));

        String text = new PricingChatBrief(client).brief("What is a fair price for Shiraz?", tenant);

        assertTrue(text.contains("Barossa Shiraz"));
        assertTrue(text.contains("recorded 28-day POS units"));
        assertTrue(text.contains("public manufacturer and competitor prices are not included"));
        verify(client).review(tenant, "Shiraz");
    }

    @Test
    void chineseProductPriceQuestionUsesOnlyTheNamedProduct() {
        NativePriceSuggestionService client = mock(NativePriceSuggestionService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.review(tenant, "Penfolds Shiraz")).thenReturn(new PriceReviewBrief(
                0.30, List.of(new PriceReviewItem(1, "Penfolds Shiraz", 8, 24.99, 27.95, "raise")), 1));

        String text = new PricingChatBrief(client).brief("这款 Penfolds Shiraz 价格合不合理？", tenant);

        assertTrue(text.contains("Penfolds Shiraz"));
        assertTrue(text.contains("近 28 天本店 POS 销量排序"));
        assertTrue(text.contains("不含公开厂商或竞品价格"));
        verify(client).review(tenant, "Penfolds Shiraz");
    }

    @Test
    void genericChineseWinePriceQuestionAsksForProductInsteadOfListingUnrelatedItems() {
        NativePriceSuggestionService client = mock(NativePriceSuggestionService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));

        String text = new PricingChatBrief(client).brief("这款酒价格合不合理？", tenant);

        assertTrue(text.contains("商品名称或条码"));
        assertTrue(text.contains("尚未接入公开厂商或竞品价格"));
        verifyNoInteractions(client);
    }

    @Test
    void fairPriceQuestionDoesNotReturnUnrelatedPopularProductsWhenThereIsNoMatch() {
        NativePriceSuggestionService client = mock(NativePriceSuggestionService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.review(tenant, "Not in catalogue")).thenReturn(new PriceReviewBrief(0.30, List.of(), 0));

        String text = new PricingChatBrief(client).brief("What is a fair price for Not in catalogue?", tenant);

        assertTrue(text.contains("couldn't match"));
        assertTrue(text.contains("exact product name or barcode"));
    }

    @Test
    void briefMarksMissingOrFailedReviewUnavailableWithRetry() {
        NativePriceSuggestionService client = mock(NativePriceSuggestionService.class);
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
        NativePriceSuggestionService client = mock(NativePriceSuggestionService.class);

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

}
