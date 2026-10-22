package com.orithos.modules.ai.sommelier;

import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.sommelier.dto.RecommendCard;
import com.orithos.modules.ai.sommelier.dto.RecommendResponse;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
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

    private static RecommendCard card(String badge, String name, String price) {
        return new RecommendCard(
                1L, name, "good", badge, new BigDecimal(price), new BigDecimal(price),
                false, BigDecimal.ONE, null, 80, 50, 50, 50, 50, 80,
                "red", null, null, null, List.of(), List.of(), List.of(), null, null, null);
    }
}
