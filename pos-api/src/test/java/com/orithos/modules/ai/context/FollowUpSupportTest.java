package com.orithos.modules.ai.context;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FollowUpSupportTest {

    @Test
    void detectsRelativeFollowUps() {
        assertTrue(FollowUpSupport.isRelativeFollowUp("那昨天呢"));
        assertTrue(FollowUpSupport.isRelativeFollowUp("and yesterday?"));
        assertTrue(FollowUpSupport.isRelativeFollowUp("昨天"));
        assertFalse(FollowUpSupport.isRelativeFollowUp("今天销售额"));
        assertFalse(FollowUpSupport.isRelativeFollowUp("compare yesterday with today"));
    }

    @Test
    void mergesMissingCategoryFromPreviousSlots() {
        Map<String, String> merged = FollowUpSupport.mergeMissingSlots(
                Map.of("from", "2026-10-21"),
                Map.of("category", "beer", "days", "7"));
        assertEquals("2026-10-21", merged.get("from"));
        assertEquals("beer", merged.get("category"));
        assertEquals("7", merged.get("days"));
    }

    @Test
    void normalizesKnownSurfaces() {
        assertEquals("sell", FollowUpSupport.normalizeSurface("Sell"));
        assertEquals("products", FollowUpSupport.normalizeSurface("products"));
        assertEquals("", FollowUpSupport.normalizeSurface(" "));
    }
}
