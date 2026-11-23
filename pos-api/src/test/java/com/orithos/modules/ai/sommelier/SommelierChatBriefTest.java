package com.orithos.modules.ai.sommelier;

import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.sommelier.dto.RecommendCard;
import com.orithos.modules.ai.sommelier.dto.RecommendResponse;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SommelierChatBriefTest {

    @Test
    void briefIsReadableWithCleanNamesPricesAndNewlines() {
        SommelierService service = mock(SommelierService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(service.recommend(any(), any())).thenReturn(new RecommendResponse(
                null,
                List.of(
                        card("Great Value",
                                "[R2-11eee66f71b39c7abc790636865404] R2 TEST | PIZZINI SANGIOVESE SHIRAZ 750M",
                                "19.9909"),
                        card("Best Match",
                                "[R2-11eee66f71b3841aa14c0636865404] R2 TEST | RARE PENNY SHIRAZ",
                                "13.6273")),
                null));

        String text = new SommelierChatBrief(service).brief("Recommend a red wine under $30", tenant);

        assertTrue(text.contains("Here are in-stock picks (red) under $30.00:"));
        assertTrue(text.contains("\n• Great Value — PIZZINI SANGIOVESE SHIRAZ 750M — $19.99"));
        assertTrue(text.contains("\n• Best Match — RARE PENNY SHIRAZ — $13.63"));
        assertTrue(text.contains("\n\nTap below to open the full wine assistant."));
        assertFalse(text.contains("R2 TEST"));
        assertFalse(text.contains("[R2-"));
        assertFalse(text.contains("19.9909"));
    }

    @Test
    void briefFormatsChineseWinePicksAndPreservesNamesAndPrices() {
        SommelierService service = mock(SommelierService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(service.recommend(any(), any())).thenReturn(new RecommendResponse(
                null, List.of(card("Best Match", "R2 TEST | RARE PENNY SHIRAZ", "13.6273")), null));

        String text = new SommelierChatBrief(service).brief("推荐一款 30 元以内的红酒", tenant);

        assertTrue(text.contains("为你推荐以下有库存的酒款（红葡萄酒），预算不超过 $30.00："));
        assertTrue(text.contains("\n• 优选 — RARE PENNY SHIRAZ — $13.63"));
        assertTrue(text.contains("打开品鉴推荐页面查看全部酒款。"));
        assertFalse(text.contains("R2 TEST"));
    }

    @Test
    void chineseWineStylesAreDetectedInsideNaturalPhrases() {
        var redWithSteak = SommelierChatBrief.fromQuestion("红酒配牛排");
        var whiteWithSeafood = SommelierChatBrief.fromQuestion("想喝白葡萄酒配海鲜");
        var sparkling = SommelierChatBrief.fromQuestion("推荐起泡酒");

        assertEquals("red", redWithSteak.wineType());
        assertEquals("steak dinner", redWithSteak.occasion());
        assertEquals("white", whiteWithSeafood.wineType());
        assertEquals("sparkling", sparkling.wineType());
    }

    @Test
    void australianBudgetAndMealReachTheWineMatcher() {
        var white = SommelierChatBrief.fromQuestion("Recommend a white wine under A$30 for prawns and fish");
        assertEquals(new BigDecimal("30"), white.budgetMax());
        assertEquals("white", white.wineType());
        assertEquals(List.of("seafood", "fish"), white.food());
        var barbecue = SommelierChatBrief.fromQuestion("推荐 35 澳元以内、配烤羊肉和烧烤的红酒");
        assertEquals(new BigDecimal("35"), barbecue.budgetMax());
        assertEquals(List.of("lamb", "bbq"), barbecue.food());
    }

    @Test
    void unavailableCatalogueIsExplicitAndDoesNotInventRecommendations() {
        SommelierService service = mock(SommelierService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(service.recommend(any(), any())).thenThrow(new IllegalStateException("catalogue unavailable"));

        String unavailable = new SommelierChatBrief(service).brief("Recommend a red wine", tenant);
        String missingTenant = new SommelierChatBrief(service).brief("Recommend a red wine", null);

        assertTrue(unavailable.toLowerCase().contains("unavailable"));
        assertTrue(unavailable.contains("retry"));
        assertTrue(missingTenant.toLowerCase().contains("unavailable"));
        verify(service, times(1)).recommend(any(), any());
    }

    @Test
    void chineseServiceFailureIsUnavailableInChinese() {
        SommelierService service = mock(SommelierService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(service.recommend(any(), any())).thenThrow(new IllegalStateException("catalogue unavailable"));

        String text = new SommelierChatBrief(service).brief("推荐一款红酒", tenant);

        assertTrue(text.contains("暂不可用"));
        assertTrue(text.contains("重试"));
    }

    private static RecommendCard card(String badge, String name, String price) {
        return new RecommendCard(
                1L, name, "good", badge, new BigDecimal(price), new BigDecimal(price),
                false, BigDecimal.ONE, null, 80, 50, 50, 50, 50, 80,
                "red", null, null, null, List.of(), List.of(), List.of(), null, null, null, false);
    }
}
