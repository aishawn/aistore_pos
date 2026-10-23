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
    void currentFollowUpSlotsOverridePreviousValuesAndOnlyKnownSlotsCarryForward() {
        Map<String, String> merged = FollowUpSupport.mergeMissingSlots(
                Map.of("query", "lager", "category", "drinks"),
                Map.of("query", "wine", "category", "wine", "days", "30", "from", "2026-10-01"));

        assertEquals("lager", merged.get("query"));
        assertEquals("drinks", merged.get("category"));
        assertEquals("30", merged.get("days"));
        assertFalse(merged.containsKey("from"));
    }

    @Test
    void relativeReportFollowUpsInheritMissingSlotsButIndependentQuestionsDoNot() {
        Map<String, String> previous = Map.of("query", "Shiraz", "category", "wine", "days", "7");

        Map<String, String> followUp = FollowUpSupport.mergeFollowUpSlots(
                "那昨天呢", "report_sales", Map.of("from", "2026-10-22"), previous);
        Map<String, String> independent = FollowUpSupport.mergeFollowUpSlots(
                "Which prices should I review?", "report_sales", Map.of(), previous);
        Map<String, String> previousAdhoc = FollowUpSupport.mergeFollowUpSlots(
                "and yesterday?", "report_adhoc", Map.of(), previous);

        assertEquals(Map.of("from", "2026-10-22", "query", "Shiraz", "category", "wine"),
                followUp);
        assertEquals(Map.of(), independent);
        assertEquals(Map.of(), previousAdhoc);
    }

    @Test
    void normalizesKnownSurfaces() {
        assertEquals("sell", FollowUpSupport.normalizeSurface("Sell"));
        assertEquals("products", FollowUpSupport.normalizeSurface("products"));
        assertEquals("", FollowUpSupport.normalizeSurface(" "));
    }
}
