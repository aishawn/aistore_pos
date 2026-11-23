package com.orithos.modules.ai.replenishment;

import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.report.ReportQueryService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@Service
@ConditionalOnProperty(name = "app.ai.enabled", havingValue = "true")
public class StoreOpportunitiesBriefService {

    private final ReportQueryService reportQueryService;
    private final NativeReplenishmentService replenishmentService;

    public StoreOpportunitiesBriefService(ReportQueryService reportQueryService,
                                          NativeReplenishmentService replenishmentService) {
        this.reportQueryService = reportQueryService;
        this.replenishmentService = replenishmentService;
    }

    public AssistantStoreOpportunitiesBriefResponse build(TenantContext tenant) {
        Long outletId = tenant.requireOutletId();
        if (outletId == null) {
            throw new IllegalStateException("Store outlet is required");
        }
        ReplenishmentPlan plan = replenishmentService.plan(tenant);
        LocalDate today = plan.periodTo();
        LocalDate weekStart = reportQueryService.weekStart(today, tenant.vendorId());
        Map<String, Object> overview = reportQueryService.nativeOverview(tenant.vendorId(), outletId, weekStart, today);

        String salesStatus = stringValue(overview.get("reportDataStatus"));
        String replenishmentStatus = mapReplenishmentStatus(plan.dataQualityStatus());
        String combinedStatus = worstStatus(salesStatus, replenishmentStatus);

        String salesDataAsOf = overview.get("dataAsOf") == null ? null : overview.get("dataAsOf").toString();
        String replenishmentDataAsOf = plan.dataAsOf() == null ? null : plan.dataAsOf().toString();
        String dataAsOf = latestTimestamp(salesDataAsOf, replenishmentDataAsOf);

        AssistantStoreOpportunitiesBriefResponse.OpportunitiesSalesSection sales =
                new AssistantStoreOpportunitiesBriefResponse.OpportunitiesSalesSection(
                        overview.get("revenue") == null ? null : overview.get("revenue").toString(),
                        longValue(overview.get("transactions")),
                        "AUD",
                        salesStatus,
                        salesDataAsOf);

        int actionable = Math.max(0, plan.itemsNeedingOrder());
        AssistantStoreOpportunitiesBriefResponse.OpportunitiesReplenishmentSection replenishment =
                new AssistantStoreOpportunitiesBriefResponse.OpportunitiesReplenishmentSection(
                        plan.coverageDays(),
                        plan.itemsNeedingOrder(),
                        actionable,
                        plan.dataGapCount(),
                        plan.inventoryGapCount(),
                        plan.supplierGapCount(),
                        plan.costGapCount(),
                        plan.top() == null ? List.of() : plan.top(),
                        replenishmentStatus,
                        replenishmentDataAsOf,
                plan.periodFrom(), plan.periodTo(), plan.timeZone());

        return new AssistantStoreOpportunitiesBriefResponse(
                "orithos_ledger",
                "current_authenticated_store",
                weekStart,
                today,
                plan.timeZone(),
                combinedStatus,
                dataAsOf,
                sales,
                replenishment);
    }

    private static String mapReplenishmentStatus(String dataQualityStatus) {
        if (dataQualityStatus == null) {
            return "unavailable";
        }
        return switch (dataQualityStatus.trim().toUpperCase()) {
            case "NO_DATA" -> "no_data";
            case "DATA_INCOMPLETE" -> "incomplete";
            case "VALID" -> "available";
            default -> "unavailable";
        };
    }

    private static String worstStatus(String salesStatus, String replenishmentStatus) {
        int salesRank = statusRank(salesStatus);
        int replenishmentRank = statusRank(replenishmentStatus);
        String chosen = replenishmentRank >= salesRank ? replenishmentStatus : salesStatus;
        return chosen == null || chosen.isBlank() ? "unavailable" : chosen;
    }

    private static int statusRank(String status) {
        if (status == null) {
            return 3;
        }
        return switch (status.trim().toLowerCase()) {
            case "available" -> 0;
            case "no_data" -> 1;
            case "incomplete" -> 2;
            default -> 3;
        };
    }

    private static String stringValue(Object value) {
        return value == null ? "unavailable" : value.toString().trim().toLowerCase();
    }

    private static long longValue(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value == null) {
            return 0L;
        }
        try {
            return Long.parseLong(value.toString().trim());
        } catch (NumberFormatException ignored) {
            return 0L;
        }
    }

    private static String latestTimestamp(String first, String second) {
        if (first == null || first.isBlank()) {
            return second;
        }
        if (second == null || second.isBlank()) {
            return first;
        }
        return first.compareTo(second) >= 0 ? first : second;
    }
}