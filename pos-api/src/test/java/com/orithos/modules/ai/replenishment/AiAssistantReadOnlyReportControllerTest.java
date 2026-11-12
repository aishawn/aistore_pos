package com.orithos.modules.ai.replenishment;

import com.orithos.common.ApiResult;
import com.orithos.common.AustraliaTime;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.report.TenantContextFactory;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiAssistantReadOnlyReportControllerTest {
    @Test
    void returnsTenantScopedReadOnlyPlanWithAuthoritativeProvenance() {
        TenantContextFactory tenantContextFactory = mock(TenantContextFactory.class);
        NativeReplenishmentService replenishmentService = mock(NativeReplenishmentService.class);
        TenantContext tenant = new TenantContext(55L, 7L, 87L, List.of(87L), Set.of(TenantContext.PERM_QUERY));
        Instant dataAsOf = Instant.parse("2026-11-12T07:30:00Z");
        ReplenishmentPlan plan = new ReplenishmentPlan(21, 2,
                List.of(new ReplenishmentSuggestion(1, "Shiraz", "units", 12, 5d, 1d)),
                "DATA_INCOMPLETE", List.of("Shiraz: supplier unavailable"), dataAsOf, 25);
        when(tenantContextFactory.fromSecurity()).thenReturn(tenant);
        when(replenishmentService.plan(tenant)).thenReturn(plan);

        AiAssistantReadOnlyReportController controller = new AiAssistantReadOnlyReportController(
                tenantContextFactory, replenishmentService);
        ApiResult<AssistantReplenishmentPreviewResponse> response = controller.replenishmentReport();

        assertEquals(0, response.code());
        assertEquals("orithos_ledger", response.data().dataSource());
        assertEquals("current_authenticated_store", response.data().storeScope());
        assertEquals(AustraliaTime.today().minusDays(56), response.data().reportPeriodFrom());
        assertEquals(AustraliaTime.today(), response.data().reportPeriodTo());
        assertEquals("Australia/Adelaide", response.data().reportTimeZone());
        assertEquals("incomplete", response.data().reportDataStatus());
        assertEquals(dataAsOf.toString(), response.data().dataAsOf());
        assertEquals(25, response.data().dataGapCount());
        verify(replenishmentService).plan(tenant);
    }
}
