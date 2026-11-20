package com.orithos.modules.ai.sommelier;

import com.orithos.modules.ai.gateway.AiGateway;
import com.orithos.modules.ai.report.TenantContext;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.ObjectProvider;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class WinePitchServiceGroundingTest {

    @Test
    @SuppressWarnings("unchecked")
    void inferredProfilesUseAttributedTemplatesWithoutCallingTheModel() {
        ObjectProvider<ChatClient> clients = mock(ObjectProvider.class);
        ObjectProvider<AiGateway> gatewayProvider = mock(ObjectProvider.class);
        AiGateway gateway = mock(AiGateway.class);
        WinePitchService service = new WinePitchService(clients, gatewayProvider);
        WineCandidate wine = new WineCandidate(22080L, "Blickinstal Black on Black Shiraz 750ML",
                null, null, "WINE", null, null, new BigDecimal("119.99"), new BigDecimal("119.99"),
                false, BigDecimal.valueOf(3), true, null,
                new WineProfile("red", "Shiraz", null, null, null, 0.9, null, null, null,
                        List.of("Plum", "Spice", "Oak"), List.of("Dry", "Rich"),
                        List.of("steak", "lamb", "bbq", "grilled_meat"), "Long, spicy finish", true));
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));

        String pitch = service.pitch(wine, null, "10s", tenant);
        String answer = service.answer(wine, "What food would pair well with this wine?", List.of(), tenant);
        String chineseAnswer = service.answer(wine, "这款酒适合搭配什么食物？", List.of(), tenant);

        assertTrue(pitch.contains("current style profile"));
        assertTrue(pitch.contains("Plum, Spice, Oak"));
        assertTrue(answer.contains("current style profile suggests pairing"));
        assertTrue(answer.contains("steak"));
        assertTrue(answer.contains("lamb"));
        assertFalse(answer.contains("BBQ, BBQ"));
        assertEquals("当前风格资料建议搭配：牛排、羊肉、烧烤。", chineseAnswer);
        assertFalse(pitch.toLowerCase().contains("alcohol"));
        assertFalse(pitch.toLowerCase().contains("decant"));
        assertFalse(answer.toLowerCase().contains("alcohol"));
        assertFalse(answer.toLowerCase().contains("decant"));
        verifyNoInteractions(clients, gatewayProvider, gateway);
    }
}
