package com.orithos.modules.ai;

import com.orithos.modules.ai.dto.AssistantCard;
import com.orithos.modules.ai.dto.UiAction;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PosAssistantGraphServiceCardTest {

    @Test
    void mapsPricingBriefToReadyCardWithReviewCtaAndTopThreeItems() {
        List<AssistantCard> cards = PosAssistantGraphService.cardsFor(
                "navigate",
                new UiAction("stock", "pricing", "/stock/capped-pricing", "navigate"),
                "Prices that need review:\n• Shiraz — $24.99 → suggest $27.95\n• Riesling — $19.99 → suggest $21.95\n• Merlot — $29.99 → suggest $31.95\n• Cabernet — $39.99 → suggest $41.95");

        assertEquals(1, cards.size());
        AssistantCard card = cards.getFirst();
        assertEquals("pricing", card.type());
        assertEquals("ready", card.status());
        assertEquals(3, card.items().size());
        assertEquals("Open price review", card.ctaLabel());
        assertEquals("/stock/capped-pricing", card.ctaRoute());
    }

    @Test
    void mapsEmptyPricingBriefToStableEmptyReason() {
        List<AssistantCard> cards = PosAssistantGraphService.cardsFor(
                "navigate",
                new UiAction("stock", "pricing", "/stock/capped-pricing", "navigate"),
                "No price suggestions need review right now.");

        AssistantCard card = cards.getFirst();
        assertEquals("empty", card.status());
        assertEquals("No price suggestions need review right now.", card.emptyReason());
        assertTrue(card.items().isEmpty());
    }
}
