package com.orithos.modules.ai.replenishment;

import java.time.Instant;
import java.util.List;

/** Read-only replenishment plan slice used by the assistant chat brief. */
public record ReplenishmentPlan(
        int coverageDays,
        int itemsNeedingOrder,
        List<ReplenishmentSuggestion> top,
        String dataQualityStatus,
        List<String> dataGaps,
        Instant dataAsOf,
        int dataGapCount
) {
    public ReplenishmentPlan(int coverageDays, int itemsNeedingOrder, List<ReplenishmentSuggestion> top) {
        this(coverageDays, itemsNeedingOrder, top, "VALID", List.of(), null, 0);
    }

    public ReplenishmentPlan(int coverageDays, int itemsNeedingOrder, List<ReplenishmentSuggestion> top,
                             String dataQualityStatus, List<String> dataGaps, Instant dataAsOf) {
        this(coverageDays, itemsNeedingOrder, top, dataQualityStatus, dataGaps, dataAsOf,
                dataGaps == null ? 0 : dataGaps.size());
    }

    public ReplenishmentPlan {
        dataQualityStatus = dataQualityStatus == null || dataQualityStatus.isBlank()
                ? "VALID" : dataQualityStatus;
        dataGaps = dataGaps == null ? List.of() : List.copyOf(dataGaps);
        dataGapCount = Math.max(dataGapCount, dataGaps.size());
    }
}
