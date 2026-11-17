package com.orithos.modules.ai.replenishment;

import com.orithos.common.AustraliaTime;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.report.ReportQueryService;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class StoreOpportunitiesBriefServiceTest {

    @Test
    void combinesSalesAndReplenishmentWithWorstDataStatus() {
        ReportQueryService reports = mock(ReportQueryService.class);
        NativeReplenishmentService replenishment = mock(NativeReplenishmentService.class);
        TenantContext tenant = new TenantContext(9L, 3L, 21L, List.of(21L), Set.of(TenantContext.PERM_QUERY));
        LocalDate today = AustraliaTime.today();
        LocalDate weekStart = today.with(java.time.DayOfWeek.MONDAY);

        when(reports.nativeOverview(eq(9L), eq(21L), eq(weekStart), eq(today))).thenReturn(Map.of(
                "revenue", "$1,240.00",
                "transactions", 42L,
                "reportDataStatus", "available",
                "dataAsOf", "2026-11-17T08:00:00Z"));
        ReplenishmentPlan plan = new ReplenishmentPlan(21, 5,
                List.of(new ReplenishmentSuggestion(1, "Cola", "units", 24, 2d, 1d)),
                "DATA_INCOMPLETE", List.of("Wine: supplier unavailable"),
                Instant.parse("2026-11-17T07:00:00Z"), 1, 0, 1);
        when(replenishment.plan(tenant)).thenReturn(plan);

        StoreOpportunitiesBriefService service = new StoreOpportunitiesBriefService(reports, replenishment);
        AssistantStoreOpportunitiesBriefResponse brief = service.build(tenant);

        assertEquals("incomplete", brief.reportDataStatus());
        assertEquals("available", brief.sales().reportDataStatus());
        assertEquals("incomplete", brief.replenishment().reportDataStatus());
        assertEquals(5, brief.replenishment().actionableItemCount());
        assertEquals(42L, brief.sales().transactions());
        verify(reports).nativeOverview(9L, 21L, weekStart, today);
        verify(replenishment).plan(tenant);
    }
}