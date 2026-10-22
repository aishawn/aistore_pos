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
        AssistantCardCta cta
) {}
