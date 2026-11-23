package com.orithos.modules.ai.replenishment;

import java.time.LocalDate;
import java.util.List;

public record AssistantReplenishmentPreviewResponse(
        String dataSource,
        String storeScope,
        LocalDate reportPeriodFrom,
        LocalDate reportPeriodTo,
        String reportTimeZone,
        String reportDataStatus,
        String dataAsOf,
        int coverageDays,
        int itemsNeedingOrder,
        List<ReplenishmentSuggestion> top,
        int dataGapCount,
        List<String> dataGaps,
        int inventoryGapCount,
        int supplierGapCount,
        int costGapCount,
        int actionableItemCount
) {
    public static AssistantReplenishmentPreviewResponse from(ReplenishmentPlan plan) {
        return new AssistantReplenishmentPreviewResponse(
                "orithos_ledger",
                "current_authenticated_store",
                plan.periodFrom(),
                plan.periodTo(),
                plan.timeZone(),
                "NO_DATA".equalsIgnoreCase(plan.dataQualityStatus()) ? "no_data"
                        : "DATA_INCOMPLETE".equalsIgnoreCase(plan.dataQualityStatus()) ? "incomplete" : "available",
                plan.dataAsOf() == null ? null : plan.dataAsOf().toString(),
                plan.coverageDays(),
                plan.itemsNeedingOrder(),
                plan.top(),
                plan.dataGapCount(),
                plan.dataGaps(),
                plan.inventoryGapCount(),
                plan.supplierGapCount(),
                plan.costGapCount(),
                Math.max(0, plan.itemsNeedingOrder())
        );
    }
}
