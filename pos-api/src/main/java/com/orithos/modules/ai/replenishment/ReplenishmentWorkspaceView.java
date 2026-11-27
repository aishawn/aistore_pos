package com.orithos.modules.ai.replenishment;

import java.util.List;
import java.util.Map;

/** JSON shape aligned with OdooReplenishmentPage ReplenishmentData. */
public record ReplenishmentWorkspaceView(
        String company,
        int historyDays,
        int periodDays,
        int coverageDays,
        List<ReplenishmentWorkspaceProduct> products,
        boolean exceptionMode,
        int exceptionCount,
        boolean truncated,
        SalesHistory salesHistory,
        int reviewRequiredCount,
        Map<String, Integer> reviewIssueCounts,
        String generatedAt,
        InventoryHistory inventoryHistory,
        Forecast forecast,
        PurchaseWorkflow purchaseWorkflow,
        CatalogueCoverage catalogueCoverage
) {
    public record ReplenishmentWorkspaceProduct(
            long id,
            String name,
            String sku,
            String unit,
            double soldUnits,
            double recentUnits,
            double previousUnits,
            double unitsPerDay,
            Double trendPercent,
            String trend,
            double onHand,
            double forecastStock,
            Double daysOfStock,
            String recommendationStatus,
            List<String> dataIssues,
            double suggestedQuantity,
            String reason,
            List<String> reasonParts,
            String method,
            Double unitCost,
            Double unitPrice,
            String risk,
            String attentionLevel,
            List<String> attentionReasons,
            Long supplierId, String supplierName, Double caseQuantity, double onOrder, Integer leadTimeDays
    ) { }

    public record SalesHistory(
            String timezone,
            boolean timezoneVerified,
            String source,
            java.time.LocalDate startDate,
            java.time.LocalDate endDateExclusive,
            boolean completeDaysOnly,
            String refunds
    ) { }

    public record InventoryHistory(
            String status,
            String lastSuccessAt,
            String businessTimezone,
            Integer expectedProducts,
            Integer capturedProducts,
            Double productCoverage,
            Integer observedDays,
            Integer gapDays,
            Integer invalidSnapshots,
            Map<String, Integer> missingFields,
            java.time.LocalDate firstBusinessDate,
            java.time.LocalDate latestBusinessDate
    ) { }

    public record Forecast(
            boolean enabled,
            String modelSelection,
            String status,
            String modelVersion
    ) { }

    public record PurchaseWorkflow(boolean draftEnabled, String mode, String disabledReason) { }

    public record CatalogueCoverage(String status, int loadedProducts, int eligibleProducts, int forecastedProducts) { }
}
