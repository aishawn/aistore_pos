package com.orithos.modules.ai.dto;

import java.util.List;
import java.util.Map;

/** Additive in-chat result shape; answer/table remain compatibility fallbacks. */
public record AssistantCard(
        String type,
        String title,
        String summary,
        List<Map<String, Object>> items,
        String source,
        String generatedAt,
        String emptyReason,
        String status,
        String ctaLabel,
        String ctaRoute,
        AssistantCardCta cta,
        Boolean retryable
) {
    /** Source compatibility for callers using the card shape before retry guidance was added. */
    public AssistantCard(String type,
                         String title,
                         String summary,
                         List<Map<String, Object>> items,
                         String source,
                         String generatedAt,
                         String emptyReason,
                         String status,
                         String ctaLabel,
                         String ctaRoute,
                         AssistantCardCta cta) {
        this(type, title, summary, items, source, generatedAt, emptyReason, status,
                ctaLabel, ctaRoute, cta, null);
    }

    /** Binary/source compatibility for callers compiled against the original card shape. */
    public AssistantCard(String type,
                         String title,
                         String summary,
                         List<Map<String, Object>> items,
                         String source,
                         String generatedAt,
                         String emptyReason,
                         String status,
                         String ctaLabel,
                         String ctaRoute) {
        this(type, title, summary, items, source, generatedAt, emptyReason, status,
                ctaLabel, ctaRoute, null, null);
    }
}
