package com.orithos.modules.ai.sommelier;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WineMatcherTest {

    private final WineMatcher matcher = new WineMatcher();

    @Test
    void hardFilterDropsOutOfStockAndWrongType() {
        WineCandidate oos = wine(1, "OOS Shiraz", "red", "18.00", 0);
        WineCandidate white = wine(2, "House Chardonnay", "white", "18.00", 6);
        WineCandidate red = wine(3, "House Shiraz", "red", "19.00", 8);
        CustomerWineProfile profile = new CustomerWineProfile(
                "red", new BigDecimal("15"), new BigDecimal("25"),
                0.85, 0.9, null, null, null, List.of("steak"), "dinner");
        List<WineCandidate> kept = matcher.hardFilter(List.of(oos, white, red), profile);
        assertEquals(1, kept.size());
        assertEquals(3L, kept.get(0).productId());
    }

    @Test
    void pickThreeSpreadsPriceTiers() {
        List<WineCandidate> inventory = List.of(
                wine(10, "Value Shiraz", "red", "15.00", 12),
                wine(11, "Core Shiraz", "red", "20.00", 9),
                wine(12, "Reserve Shiraz", "red", "25.00", 5),
                wine(13, "Cheap leftover", "red", "15.50", 2)
        );
        CustomerWineProfile profile = new CustomerWineProfile(
                "red", new BigDecimal("15"), new BigDecimal("25"),
                0.85, 0.9, null, null, 0.7, List.of("steak"), "dinner");
        List<WineMatcher.ScoredWine> scored = matcher.match(inventory, profile);
        WineMatcher.TierPick pick = matcher.pickThree(scored);
        assertEquals(3, pick.asList().size());
        assertTrue(pick.goodValue().wine().effectivePrice().compareTo(pick.premium().wine().effectivePrice()) <= 0);
        assertEquals(3, pick.asList().stream().map(s -> s.wine().productId()).distinct().count());
    }

    @Test
    void matchDoesNotExceedAnExplicitBudgetToFillThreeRecommendations() {
        List<WineCandidate> inventory = List.of(
                wine(40, "Within budget Shiraz", "red", "14.99", 8),
                wine(41, "Over budget Shiraz one", "red", "15.99", 8),
                wine(42, "Over budget Shiraz two", "red", "17.99", 8)
        );
        CustomerWineProfile profile = new CustomerWineProfile(
                "red", BigDecimal.ZERO, new BigDecimal("15.00"),
                0.5, 0.5, null, null, null, List.of("steak"), "dinner");

        List<WineMatcher.ScoredWine> matches = matcher.match(inventory, profile);

        assertEquals(List.of(40L), matches.stream().map(s -> s.wine().productId()).toList());
        assertEquals(1, matcher.pickThree(matches).asList().size());
    }

    @Test
    void matchDoesNotGoBelowAnExplicitMinimumBudgetToFillThreeRecommendations() {
        List<WineCandidate> inventory = List.of(
                wine(50, "Below budget Shiraz", "red", "13.00", 8),
                wine(51, "Within budget Shiraz one", "red", "18.00", 8),
                wine(52, "Within budget Shiraz two", "red", "19.00", 8)
        );
        CustomerWineProfile profile = new CustomerWineProfile(
                "red", new BigDecimal("15.00"), new BigDecimal("20.00"),
                0.5, 0.5, null, null, null, List.of("steak"), "dinner");

        List<WineMatcher.ScoredWine> matches = matcher.match(inventory, profile);

        assertEquals(List.of(51L, 52L), matches.stream().map(s -> s.wine().productId()).toList());
        assertEquals(2, matcher.pickThree(matches).asList().size());
    }

    @Test
    void similarCheaperStaysSameStyleAndLowerPrice() {
        WineCandidate current = wine(20, "Bin 28 Shiraz", "red", "29.99", 8);
        List<WineCandidate> inventory = List.of(
                current,
                wine(21, "House Shiraz", "red", "22.99", 10),
                wine(22, "Pricey Cab", "red", "39.00", 4),
                wine(23, "Sauv Blanc", "white", "18.00", 6)
        );
        List<WineMatcher.ScoredWine> cheaper = matcher.similar(inventory, current, "cheaper");
        assertEquals(1, cheaper.size());
        assertEquals(21L, cheaper.get(0).wine().productId());
    }

    @Test
    void steakFoodBeatsMismatch() {
        WineCandidate steakWine = wine(30, "Steak Shiraz", "red", "20.00", 8);
        WineCandidate fishWine = new WineCandidate(
                31L, "Pinot", null, null, "Wine", "Wine", null,
                new BigDecimal("20.00"), new BigDecimal("20.00"), false,
                new BigDecimal("8"), true, BigDecimal.ONE,
                WineLexicon.infer("Pinot Noir", "Wine", "Wine", null));
        CustomerWineProfile profile = new CustomerWineProfile(
                "red", new BigDecimal("15"), new BigDecimal("25"),
                0.85, 0.9, null, null, null, List.of("steak"), "dinner");
        double steak = matcher.score(steakWine, profile).foodMatch();
        double fish = matcher.score(fishWine, profile).foodMatch();
        assertTrue(steak > fish);
    }

    private static WineCandidate wine(long id, String name, String type, String price, int stock) {
        WineProfile profile = switch (type) {
            case "white" -> WineLexicon.infer(name.contains("Chard") ? "Chardonnay" : "Sauvignon Blanc", "Wine", "Wine", null);
            default -> WineLexicon.infer("Shiraz " + name, "Wine", "Wine", null);
        };
        BigDecimal p = new BigDecimal(price);
        return new WineCandidate(id, name, null, null, "Wine", "Wine", null,
                p, p, false, new BigDecimal(stock), true, BigDecimal.ONE, profile);
    }
}
