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

    @Test
    void mapsZeroProductCountToEmptyCardWithoutInventingItems() {
        List<AssistantCard> cards = PosAssistantGraphService.cardsFor(
                "product_count",
                new UiAction("products", "products", "/products", "navigate"),
                "This store has 0 sellable products in the catalogue. Open Products to browse.");

        AssistantCard card = cards.getFirst();
        assertEquals("empty", card.status());
        assertEquals("No sellable products are currently available in the catalogue.", card.emptyReason());
        assertTrue(card.items().isEmpty());
    }

    @Test
    void mapsNaturalLanguageZeroProductCountToEmptyCard() {
        for (String answer : List.of(
                "There are 0 products in the catalogue.",
                "商品总数为 0。打开商品页查看目录。")) {
            AssistantCard card = PosAssistantGraphService.cardsFor(
                    "product_count",
                    new UiAction("products", "products", "/products", "navigate"),
                    answer).getFirst();

            assertEquals("empty", card.status(), answer);
            assertTrue(card.items().isEmpty(), answer);
        }
    }

    @Test
    void mapsUnavailableSommelierBriefWithoutInventingItems() {
        List<AssistantCard> cards = PosAssistantGraphService.cardsFor(
                "navigate",
                new UiAction("sommelier", "recommend", "/sommelier", "navigate"),
                "Live wine recommendations are unavailable right now. Retry or open Sommelier.");

        AssistantCard card = cards.getFirst();
        assertEquals("unavailable", card.status());
        assertEquals("Live data is unavailable", card.emptyReason());
        assertTrue(card.items().isEmpty());
    }

    @Test
    void mapsGuidedActionToAnExplicitReadOnlyWorkflowCard() {
        List<AssistantCard> cards = PosAssistantGraphService.cardsFor(
                "guided_action",
                new UiAction("products", "products", "/products", "navigate"),
                "I can guide this change, but saving business data must be completed and confirmed on the page.");

        assertEquals(1, cards.size());
        AssistantCard card = cards.getFirst();
        assertEquals("guided_action", card.type());
        assertEquals("ready", card.status());
        assertEquals("assistant", card.source());
        assertEquals("/products", card.ctaRoute());
        assertEquals("Open products", card.ctaLabel());
        assertEquals("Open products", card.cta().label());
        assertEquals("/products", card.cta().route());
        assertEquals(List.of(), card.items());
    }

    @Test
    void extractsNumberedRecommendationLinesIntoAtMostThreeCardItems() {
        List<AssistantCard> cards = PosAssistantGraphService.cardsFor(
                "navigate",
                new UiAction("sommelier", "recommend", "/sommelier", "navigate"),
                "I found these matches:\n1. Shiraz — $24.99\n2) Pinot Noir — $28.00\n- Cabernet — $29.50\n• Merlot — $31.00");

        AssistantCard card = cards.getFirst();
        assertEquals(3, card.items().size());
        assertEquals("Shiraz — $24.99", card.items().getFirst().get("label"));
        assertEquals("I found these matches:", card.summary());
    }

    @Test
    void givesWorkflowCardsRouteSpecificCtaLabels() {
        AssistantCard replenishment = PosAssistantGraphService.cardsFor(
                "navigate",
                new UiAction("stock", "replenishment", "/stock/replenishment", "navigate"),
                "Top restock suggestions:\n• Shiraz — order 4").getFirst();
        AssistantCard sommelier = PosAssistantGraphService.cardsFor(
                "navigate",
                new UiAction("sommelier", "recommend", "/sommelier", "navigate"),
                "Here are in-stock picks:\n• Shiraz — $24.99").getFirst();

        assertEquals("Open replenishment", replenishment.ctaLabel());
        assertEquals("Open Sommelier", sommelier.ctaLabel());
    }

    @Test
    void keepsLegacyTenArgumentCardConstructionValid() {
        AssistantCard card = new AssistantCard(
                "pricing", "Price review", "summary", List.of(), "odoo", "now", null,
                "ready", "Open price review", "/stock/capped-pricing");

        assertEquals("/stock/capped-pricing", card.ctaRoute());
        assertEquals(null, card.cta());
    }
}
