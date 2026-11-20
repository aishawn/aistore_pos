package com.orithos.modules.ai.replenishment;

import com.orithos.common.ApiResult;
import com.orithos.common.AustraliaTime;
import com.orithos.config.CorrelationIdContext;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.report.TenantContextFactory;
import org.junit.jupiter.api.Test;
import com.orithos.common.BusinessException;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.security.access.AccessDeniedException;

import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(OutputCaptureExtension.class)
class AiAssistantReadOnlyReportControllerTest {
    @Test
    void returnsStoreOpportunitiesBrief() {
        TenantContextFactory tenantContextFactory = mock(TenantContextFactory.class);
        NativeReplenishmentService replenishmentService = mock(NativeReplenishmentService.class);
        StoreOpportunitiesBriefService opportunitiesBriefService = mock(StoreOpportunitiesBriefService.class);
        TenantContext tenant = new TenantContext(55L, 7L, 87L, List.of(87L), Set.of(TenantContext.PERM_QUERY));
        Instant dataAsOf = Instant.parse("2026-11-12T07:30:00Z");
        AssistantStoreOpportunitiesBriefResponse brief = new AssistantStoreOpportunitiesBriefResponse(
                "orithos_ledger",
                "current_authenticated_store",
                AustraliaTime.today().minusDays(6),
                AustraliaTime.today(),
                "Australia/Melbourne",
                "incomplete",
                dataAsOf.toString(),
                new AssistantStoreOpportunitiesBriefResponse.OpportunitiesSalesSection(
                        "$1,200.00", 30, "AUD", "available", dataAsOf.toString()),
                new AssistantStoreOpportunitiesBriefResponse.OpportunitiesReplenishmentSection(
                        21, 4, 4, 2, 1, 1,
                        List.of(new ReplenishmentSuggestion(1, "Shiraz", "units", 12, 5d, 1d)),
                        "incomplete", dataAsOf.toString()));
        when(tenantContextFactory.fromSecurity()).thenReturn(tenant);
        when(opportunitiesBriefService.build(tenant)).thenReturn(brief);
        AiAssistantReadOnlyReportController controller = new AiAssistantReadOnlyReportController(
                tenantContextFactory, replenishmentService, opportunitiesBriefService);

        ApiResult<AssistantStoreOpportunitiesBriefResponse> response = controller.storeOpportunitiesBrief();

        assertEquals(0, response.code());
        assertEquals("incomplete", response.data().reportDataStatus());
        assertEquals(30L, response.data().sales().transactions());
        verify(opportunitiesBriefService).build(tenant);
    }

    @Test
    void returnsTenantScopedReadOnlyPlanWithAuthoritativeProvenance() {
        TenantContextFactory tenantContextFactory = mock(TenantContextFactory.class);
        NativeReplenishmentService replenishmentService = mock(NativeReplenishmentService.class);
        TenantContext tenant = new TenantContext(55L, 7L, 87L, List.of(87L), Set.of(TenantContext.PERM_QUERY));
        Instant dataAsOf = Instant.parse("2026-11-12T07:30:00Z");
        ReplenishmentPlan plan = new ReplenishmentPlan(21, 2,
                List.of(new ReplenishmentSuggestion(1, "Shiraz", "units", 12, 5d, 1d)),
                "DATA_INCOMPLETE", List.of("Shiraz: supplier unavailable"), dataAsOf, 25, 4, 21);
        when(tenantContextFactory.fromSecurity()).thenReturn(tenant);
        when(replenishmentService.plan(tenant)).thenReturn(plan);

        StoreOpportunitiesBriefService opportunitiesBriefService = mock(StoreOpportunitiesBriefService.class);
        AiAssistantReadOnlyReportController controller = new AiAssistantReadOnlyReportController(
                tenantContextFactory, replenishmentService, opportunitiesBriefService);
        ApiResult<AssistantReplenishmentPreviewResponse> response = controller.replenishmentReport();

        assertEquals(0, response.code());
        assertEquals("orithos_ledger", response.data().dataSource());
        assertEquals("current_authenticated_store", response.data().storeScope());
        assertEquals(AustraliaTime.today().minusDays(56), response.data().reportPeriodFrom());
        assertEquals(AustraliaTime.today(), response.data().reportPeriodTo());
        assertEquals("Australia/Melbourne", response.data().reportTimeZone());
        assertEquals("incomplete", response.data().reportDataStatus());
        assertEquals(dataAsOf.toString(), response.data().dataAsOf());
        assertEquals(25, response.data().dataGapCount());
        assertEquals(4, response.data().inventoryGapCount());
        assertEquals(21, response.data().supplierGapCount());
        verify(replenishmentService).plan(tenant);
    }

    @Test
    void permissionFailureReturnsActionableMessageAndLogsSafeDiagnostics(CapturedOutput output) throws Exception {
        TenantContextFactory tenantContextFactory = mock(TenantContextFactory.class);
        NativeReplenishmentService replenishmentService = mock(NativeReplenishmentService.class);
        TenantContext tenant = new TenantContext(55L, 7L, 87L, List.of(87L), Set.of());
        when(tenantContextFactory.fromSecurity()).thenReturn(tenant);
        when(replenishmentService.plan(tenant)).thenThrow(new AccessDeniedException("internal permission detail"));
        StoreOpportunitiesBriefService opportunitiesBriefService = mock(StoreOpportunitiesBriefService.class);
        AiAssistantReadOnlyReportController controller = new AiAssistantReadOnlyReportController(
                tenantContextFactory, replenishmentService, opportunitiesBriefService);

        String correlationId = "62a47161-a36f-4b8d-9c24-98b074e0a23a";
        BusinessException failure = CorrelationIdContext.with(correlationId,
                () -> org.junit.jupiter.api.Assertions.assertThrows(BusinessException.class,
                        controller::replenishmentReport));

        assertEquals(40310, failure.getCode());
        org.junit.jupiter.api.Assertions.assertTrue(failure.getMessage().contains("permission"));
        org.junit.jupiter.api.Assertions.assertFalse(failure.getMessage().contains("internal permission detail"));
        org.junit.jupiter.api.Assertions.assertTrue(output.getAll().contains("category=permission"));
        org.junit.jupiter.api.Assertions.assertTrue(output.getAll().contains("correlationId=" + correlationId));
        org.junit.jupiter.api.Assertions.assertTrue(output.getAll().matches("(?s).*elapsedMs=\\d+.*"));
        org.junit.jupiter.api.Assertions.assertFalse(output.getAll().contains("internal permission detail"));
    }

    @Test
    void queryTimeoutIsLoggedAsTimeoutAndSanitized(CapturedOutput output) {
        TenantContextFactory tenantContextFactory = mock(TenantContextFactory.class);
        NativeReplenishmentService replenishmentService = mock(NativeReplenishmentService.class);
        TenantContext tenant = new TenantContext(55L, 7L, 87L, List.of(87L), Set.of(TenantContext.PERM_QUERY));
        when(tenantContextFactory.fromSecurity()).thenReturn(tenant);
        when(replenishmentService.plan(tenant)).thenThrow(
                new DataAccessResourceFailureException("private timeout detail", new SQLException("private SQL detail", "57014")));
        StoreOpportunitiesBriefService opportunitiesBriefService = mock(StoreOpportunitiesBriefService.class);
        AiAssistantReadOnlyReportController controller = new AiAssistantReadOnlyReportController(
                tenantContextFactory, replenishmentService, opportunitiesBriefService);

        BusinessException failure = org.junit.jupiter.api.Assertions.assertThrows(BusinessException.class,
                controller::replenishmentReport);

        assertEquals(50321, failure.getCode());
        org.junit.jupiter.api.Assertions.assertTrue(failure.getMessage().contains("temporarily unavailable"));
        org.junit.jupiter.api.Assertions.assertTrue(output.getAll().contains("category=timeout"));
        org.junit.jupiter.api.Assertions.assertFalse(output.getAll().contains("private timeout detail"));
        org.junit.jupiter.api.Assertions.assertFalse(output.getAll().contains("private SQL detail"));
    }

    @Test
    void unexpectedRuntimeFailureIsLoggedAsServiceAndSanitized(CapturedOutput output) {
        TenantContextFactory tenantContextFactory = mock(TenantContextFactory.class);
        NativeReplenishmentService replenishmentService = mock(NativeReplenishmentService.class);
        TenantContext tenant = new TenantContext(55L, 7L, 87L, List.of(87L), Set.of(TenantContext.PERM_QUERY));
        when(tenantContextFactory.fromSecurity()).thenReturn(tenant);
        when(replenishmentService.plan(tenant)).thenThrow(new IllegalStateException("private service detail"));
        StoreOpportunitiesBriefService opportunitiesBriefService = mock(StoreOpportunitiesBriefService.class);
        AiAssistantReadOnlyReportController controller = new AiAssistantReadOnlyReportController(
                tenantContextFactory, replenishmentService, opportunitiesBriefService);

        BusinessException failure = org.junit.jupiter.api.Assertions.assertThrows(BusinessException.class,
                controller::replenishmentReport);

        assertEquals(50321, failure.getCode());
        org.junit.jupiter.api.Assertions.assertTrue(failure.getMessage().contains("temporarily unavailable"));
        org.junit.jupiter.api.Assertions.assertTrue(output.getAll().contains("category=service"));
        org.junit.jupiter.api.Assertions.assertTrue(output.getAll().contains("exceptionType=IllegalStateException"));
        org.junit.jupiter.api.Assertions.assertFalse(failure.getMessage().contains("private service detail"));
        org.junit.jupiter.api.Assertions.assertFalse(output.getAll().contains("private service detail"));
    }

    @Test
    void dataAccessFailureIsSanitizedAndLoggedWithUnknownGapCount(CapturedOutput output) throws Exception {
        TenantContextFactory tenantContextFactory = mock(TenantContextFactory.class);
        NativeReplenishmentService replenishmentService = mock(NativeReplenishmentService.class);
        TenantContext tenant = new TenantContext(55L, 7L, 87L, List.of(87L), Set.of(TenantContext.PERM_QUERY));
        when(tenantContextFactory.fromSecurity()).thenReturn(tenant);
        when(replenishmentService.plan(tenant)).thenThrow(
                new DataAccessResourceFailureException("jdbc://private-host/secret", new IllegalStateException("schema private")));
        StoreOpportunitiesBriefService opportunitiesBriefService = mock(StoreOpportunitiesBriefService.class);
        AiAssistantReadOnlyReportController controller = new AiAssistantReadOnlyReportController(
                tenantContextFactory, replenishmentService, opportunitiesBriefService);

        String correlationId = "5d7a1fd7-7309-47b8-9422-209e2052451a";
        BusinessException failure = CorrelationIdContext.with(correlationId,
                () -> org.junit.jupiter.api.Assertions.assertThrows(BusinessException.class,
                        controller::replenishmentReport));

        assertEquals(50321, failure.getCode());
        org.junit.jupiter.api.Assertions.assertTrue(failure.getMessage().contains("temporarily unavailable"));
        org.junit.jupiter.api.Assertions.assertFalse(failure.getMessage().contains("private-host"));
        org.junit.jupiter.api.Assertions.assertFalse(failure.getMessage().contains("schema private"));
        org.junit.jupiter.api.Assertions.assertTrue(output.getAll().contains("correlationId=" + correlationId));
        org.junit.jupiter.api.Assertions.assertTrue(output.getAll().contains("dataGapCount=unknown"));
        org.junit.jupiter.api.Assertions.assertTrue(output.getAll().matches("(?s).*elapsedMs=\\d+.*"));
        org.junit.jupiter.api.Assertions.assertFalse(output.getAll().contains("private-host"));
        org.junit.jupiter.api.Assertions.assertFalse(output.getAll().contains("schema private"));
    }

    @Test
    void businessFailureIsAuditedWithoutExposingItsMessage(CapturedOutput output) throws Exception {
        TenantContextFactory tenantContextFactory = mock(TenantContextFactory.class);
        NativeReplenishmentService replenishmentService = mock(NativeReplenishmentService.class);
        when(tenantContextFactory.fromSecurity()).thenThrow(new BusinessException(40310, "internal access detail"));
        StoreOpportunitiesBriefService opportunitiesBriefService = mock(StoreOpportunitiesBriefService.class);
        AiAssistantReadOnlyReportController controller = new AiAssistantReadOnlyReportController(
                tenantContextFactory, replenishmentService, opportunitiesBriefService);

        String correlationId = "6ed4fbe5-60ed-47a4-ab3e-7fb787f4b008";
        BusinessException failure = CorrelationIdContext.with(correlationId,
                () -> org.junit.jupiter.api.Assertions.assertThrows(BusinessException.class,
                        controller::replenishmentReport));

        assertEquals(40310, failure.getCode());
        org.junit.jupiter.api.Assertions.assertTrue(output.getAll().contains("correlationId=" + correlationId));
        org.junit.jupiter.api.Assertions.assertTrue(output.getAll().contains("category=business"));
        org.junit.jupiter.api.Assertions.assertTrue(output.getAll().contains("code=40310"));
        org.junit.jupiter.api.Assertions.assertTrue(output.getAll().contains("dataGapCount=unknown"));
        org.junit.jupiter.api.Assertions.assertTrue(output.getAll().matches("(?s).*elapsedMs=\\d+.*"));
        org.junit.jupiter.api.Assertions.assertFalse(output.getAll().contains("internal access detail"));
    }
}
