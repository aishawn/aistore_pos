package com.orithos.modules.ai.replenishment;

import java.time.LocalDate;
import java.util.List;

public record AssistantStoreOpportunitiesBriefResponse(
        String dataSource,
        String storeScope,
        LocalDate reportPeriodFrom,
        LocalDate reportPeriodTo,
        String reportTimeZone,
        String reportDataStatus,
        String dataAsOf,
        OpportunitiesSalesSection sales,
        OpportunitiesReplenishmentSection replenishment
) {
    public record OpportunitiesSalesSection(
            String revenue,
            long transactions,
            String currency,
            String reportDataStatus,
            String dataAsOf
    ) {}

    public record OpportunitiesReplenishmentSection(
            int coverageDays,
            int itemsNeedingOrder,
            int actionableItemCount,
            int dataGapCount,
            int inventoryGapCount,
            int supplierGapCount,
            int costGapCount,
            List<ReplenishmentSuggestion> top,
            String reportDataStatus,
            String dataAsOf,
            LocalDate reportPeriodFrom,
            LocalDate reportPeriodTo,
            String reportTimeZone
    ) {}
}