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
        Instant dataAsOf
) {
    public ReplenishmentPlan(int coverageDays, int itemsNeedingOrder, List<ReplenishmentSuggestion> top) {
        this(coverageDays, itemsNeedingOrder, top, "VALID", List.of(), Instant.now());
    }

    public ReplenishmentPlan {
        dataQualityStatus = dataQualityStatus == null || dataQualityStatus.isBlank()
                ? "VALID" : dataQualityStatus;
        dataGaps = dataGaps == null ? List.of() : List.copyOf(dataGaps);
        dataAsOf = dataAsOf == null ? Instant.now() : dataAsOf;
    }
}
