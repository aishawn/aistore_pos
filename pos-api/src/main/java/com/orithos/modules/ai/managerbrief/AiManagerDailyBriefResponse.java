package com.orithos.modules.ai.managerbrief;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public record AiManagerDailyBriefResponse(
        long id,
        LocalDate businessDate,
        String timezone,
        Instant dataAsOf,
        DataQuality dataQuality,
        int revision,
        String modelStatus,
        String summaryEn,
        String summaryZh,
        List<Card> cards,
        Instant createdAt
) {
    public record DataQuality(String status, Integer expectedProducts, Integer capturedProducts,
                              Double productCoverage, Integer observedDays, Integer gapDays,
                              Integer invalidSnapshots) { }

    public record Card(String id, String type, int priority, String titleEn, String titleZh,
                       String summaryEn, String summaryZh, Long productId, String productName,
                       Map<String, Object> evidence, String detailsHref,
                       String actionEn, String actionZh, boolean requiresReview) { }

    public record Payload(String summaryEn, String summaryZh, DataQuality dataQuality, List<Card> cards) { }
}
