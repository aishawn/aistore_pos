package com.orithos.modules.ai.replenishment;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Read-only replenishment plan slice used by the assistant chat brief. */
public record ReplenishmentPlan(
        int coverageDays,
        int itemsNeedingOrder,
        List<ReplenishmentSuggestion> top,
        String dataQualityStatus,
        List<String> dataGaps,
        Instant dataAsOf,
        int dataGapCount,
        int inventoryGapCount,
        int supplierGapCount,
        int costGapCount,
        LocalDate periodFrom,
        LocalDate periodTo,
        String timeZone,
        Instant salesDataAsOf,
        Instant inventoryDataAsOf
) {
    public ReplenishmentPlan(int coverageDays, int itemsNeedingOrder, List<ReplenishmentSuggestion> top) {
        this(coverageDays, itemsNeedingOrder, top, "VALID", List.of(), null, 0, 0, 0,
                0, null, null, null, null, null);
    }

    public ReplenishmentPlan(int coverageDays, int itemsNeedingOrder, List<ReplenishmentSuggestion> top,
                             String dataQualityStatus, List<String> dataGaps, Instant dataAsOf) {
        this(coverageDays, itemsNeedingOrder, top, dataQualityStatus, dataGaps, dataAsOf,
                dataGaps == null ? 0 : dataGaps.size(), 0, 0, 0, null, null, null, null, null);
    }

    public ReplenishmentPlan(int coverageDays, int itemsNeedingOrder, List<ReplenishmentSuggestion> top,
                             String dataQualityStatus, List<String> dataGaps, Instant dataAsOf,
                             int dataGapCount) {
        this(coverageDays, itemsNeedingOrder, top, dataQualityStatus, dataGaps, dataAsOf,
                dataGapCount, 0, 0, 0, null, null, null, null, null);
    }

    public ReplenishmentPlan(int coverageDays, int itemsNeedingOrder, List<ReplenishmentSuggestion> top,
                             String dataQualityStatus, List<String> dataGaps, Instant dataAsOf,
                             int dataGapCount, int inventoryGapCount, int supplierGapCount) {
        this(coverageDays, itemsNeedingOrder, top, dataQualityStatus, dataGaps, dataAsOf,
                dataGapCount, inventoryGapCount, supplierGapCount, 0, null, null, null, null, null);
    }

    public ReplenishmentPlan(int coverageDays, int itemsNeedingOrder, List<ReplenishmentSuggestion> top,
                             String dataQualityStatus, List<String> dataGaps, Instant dataAsOf,
                             int dataGapCount, int inventoryGapCount, int supplierGapCount, int costGapCount,
                             LocalDate periodFrom, LocalDate periodTo, String timeZone) {
        this(coverageDays, itemsNeedingOrder, top, dataQualityStatus, dataGaps, dataAsOf,
                dataGapCount, inventoryGapCount, supplierGapCount, costGapCount,
                periodFrom, periodTo, timeZone, null, null);
    }

    public ReplenishmentPlan {
        dataQualityStatus = dataQualityStatus == null || dataQualityStatus.isBlank()
                ? "VALID" : dataQualityStatus;
        dataGaps = dataGaps == null ? List.of() : List.copyOf(dataGaps);
        dataGapCount = Math.max(dataGapCount, dataGaps.size());
        inventoryGapCount = Math.max(0, inventoryGapCount);
        supplierGapCount = Math.max(0, supplierGapCount);
        costGapCount = Math.max(0, costGapCount);
    }
}
