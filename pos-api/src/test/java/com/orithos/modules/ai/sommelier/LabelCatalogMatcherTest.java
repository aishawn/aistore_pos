package com.orithos.modules.ai.sommelier;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LabelCatalogMatcherTest {

    @Test
    void ranksMatchingSkuAboveUnrelated() {
        WineCandidate match = wine(1, "Penfolds Bin 28 Kalimna Shiraz 2021");
        WineCandidate other = wine(2, "Cloudy Bay Sauvignon Blanc 2023");
        WineLabelRead read = new WineLabelRead(
                "Penfolds", "Bin 28 Kalimna Shiraz", "2021", "Shiraz", null,
                List.of("Penfolds Bin 28"));
        List<WineCandidate> ranked = LabelCatalogMatcher.rank(List.of(other, match), read, 8);
        assertEquals(1L, ranked.get(0).productId());
        assertTrue(ranked.stream().noneMatch(w -> w.productId() == 2L)
                || ranked.get(0).productId() == 1L);
    }

    @Test
    void ignoresStopwordsOnlyLabels() {
        WineCandidate any = wine(3, "House Red Wine 750ml");
        WineLabelRead read = new WineLabelRead(null, "wine bottle", null, null, null, List.of());
        assertTrue(LabelCatalogMatcher.rank(List.of(any), read, 8).isEmpty());
    }

    private static WineCandidate wine(long id, String name) {
        WineProfile profile = WineLexicon.infer(name, "Wine", "Wine", null);
        BigDecimal p = new BigDecimal("20.00");
        return new WineCandidate(id, name, null, null, "Wine", "Wine", null,
                p, p, false, new BigDecimal("6"), true, BigDecimal.ONE, profile);
    }
}
