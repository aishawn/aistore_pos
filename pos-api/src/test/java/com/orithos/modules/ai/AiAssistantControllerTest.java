package com.orithos.modules.ai;

import com.orithos.common.BusinessException;
import com.orithos.common.ApiResult;
import com.orithos.modules.ai.dto.AssistantRequest;
import com.orithos.modules.ai.dto.AiReportSnapshotResponse;
import com.orithos.modules.ai.chat.AiChatHistoryService;
import com.orithos.modules.ai.report.AiReportAuditService;
import com.orithos.modules.ai.report.AiReportMetricsService;
import com.orithos.modules.ai.report.AiReportSnapshotService;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.report.TenantContextFactory;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiAssistantControllerTest {

    @Test
    @SuppressWarnings("unchecked")
    void disabledAssistantFailsClosedAndAuditsWithoutCallingGraph() {
        ObjectProvider<PosAssistantGraphService> graph = mock(ObjectProvider.class);
        when(graph.getIfAvailable()).thenReturn(null);
        TenantContext tenant = new TenantContext(42L, 7L, 3L, java.util.List.of(3L),
                java.util.Set.of(TenantContext.PERM_QUERY));
        TenantContextFactory tenants = mock(TenantContextFactory.class);
        when(tenants.fromSecurity()).thenReturn(tenant);
        AiReportAuditService audit = mock(AiReportAuditService.class);
        AiAssistantController controller = controller(graph, mock(ObjectProvider.class), tenants, audit);

        BusinessException error = assertThrows(BusinessException.class,
                () -> controller.assistant(new AssistantRequest("What were today's sales?", null)));

        assertEquals(50301, error.getCode());
        assertTrue(error.getMessage().contains("AI assistant is disabled"));
        verify(audit).recordAssistant(eq(tenant), eq("unknown"), eq(false), anyInt(),
                eq("What were today's sales?"), isNull());
    }

    @Test
    @SuppressWarnings("unchecked")
    void providerFailureReturnsSafeMessageAndDoesNotExposeProviderDetails() {
        ObjectProvider<PosAssistantGraphService> graph = mock(ObjectProvider.class);
        PosAssistantGraphService service = mock(PosAssistantGraphService.class);
        when(graph.getIfAvailable()).thenReturn(service);
        when(service.ask(eq("What should I reorder?"), isNull(), any(TenantContext.class), isNull()))
                .thenThrow(new IllegalStateException("provider request id=secret-123",
                        new IllegalArgumentException("api-key=private-value")));
        TenantContext tenant = new TenantContext(42L, 7L, 3L, java.util.List.of(3L),
                java.util.Set.of(TenantContext.PERM_QUERY));
        TenantContextFactory tenants = mock(TenantContextFactory.class);
        when(tenants.fromSecurity()).thenReturn(tenant);
        AiReportAuditService audit = mock(AiReportAuditService.class);
        AiAssistantController controller = controller(graph, mock(ObjectProvider.class), tenants, audit);
        ReflectionTestUtils.setField(controller, "aiServiceBaseUrl", "https://ai.orithos.com.au");
        ReflectionTestUtils.setField(controller, "aiServiceToken", "test-token");

        BusinessException error = assertThrows(BusinessException.class,
                () -> controller.assistant(new AssistantRequest("What should I reorder?", null)));

        assertEquals(50210, error.getCode());
        assertFalse(error.getMessage().contains("secret-123"));
        assertFalse(error.getMessage().contains("private-value"));
        assertTrue(error.getMessage().contains("temporarily unavailable"));
        verify(audit).recordAssistant(eq(tenant), eq("unknown"), eq(false), anyInt(),
                eq("What should I reorder?"), isNull());
    }

    @Test
    @SuppressWarnings("unchecked")
    void assistantResponseExposesAuthoritativeReportMetadata() {
        ObjectProvider<PosAssistantGraphService> graph = mock(ObjectProvider.class);
        PosAssistantGraphService service = mock(PosAssistantGraphService.class);
        when(graph.getIfAvailable()).thenReturn(service);
        TenantContext tenant = new TenantContext(55L, 7L, 87L, java.util.List.of(87L),
                java.util.Set.of(TenantContext.PERM_QUERY, TenantContext.PERM_COST));
        TenantContextFactory tenants = mock(TenantContextFactory.class);
        when(tenants.fromSecurity()).thenReturn(tenant);
        AiReportAuditService audit = mock(AiReportAuditService.class);
        AiChatHistoryService history = mock(AiChatHistoryService.class);
        PosAssistantGraphService.AssistantResult assistantResult = new PosAssistantGraphService.AssistantResult(
                "55:7:test-thread", "report_sales", "Sales and gross profit", "Sales for yesterday",
                java.util.Map.of(), new com.orithos.modules.ai.dto.UiAction(null, null, null, null),
                null, 91L, java.util.List.of(), java.util.List.of(), "report_sales", "deterministic", false,
                "2026-11-12T07:30:00+10:30", "orithos", "current_authenticated_store",
                "2026-11-11", "2026-11-11", "Australia/Adelaide", "available");
        when(service.ask(eq("What were sales and profit yesterday?"), isNull(), eq(tenant), isNull()))
                .thenReturn(assistantResult);
        AiAssistantController controller = new AiAssistantController(
                graph, mock(ObjectProvider.class), tenants, mock(AiReportSnapshotService.class),
                mock(AiReportMetricsService.class), audit, history);
        ReflectionTestUtils.setField(controller, "aiServiceBaseUrl", "https://ai.orithos.com.au");
        ReflectionTestUtils.setField(controller, "aiServiceToken", "test-token");

        ApiResult<com.orithos.modules.ai.dto.AssistantResponse> result = controller.assistant(
                new AssistantRequest("What were sales and profit yesterday?", null));

        assertEquals("orithos", result.data().dataSource());
        assertEquals("2026-11-11", result.data().reportPeriodFrom());
        assertEquals("2026-11-11", result.data().reportPeriodTo());
        assertEquals("Australia/Adelaide", result.data().reportTimeZone());
        assertEquals("available", result.data().reportDataStatus());
        assertTrue(result.data().writeRequests().isEmpty());
        verify(history).appendTurn(eq(tenant), eq("55:7:test-thread"),
                eq("What were sales and profit yesterday?"), eq("report_sales"), eq("Sales for yesterday"),
                eq(91L), eq(java.util.Map.of()));
    }

    @Test
    void reportSnapshotPassesCurrentTenantToOwnerScopedService() {
        ObjectProvider<PosAssistantGraphService> graph = mock(ObjectProvider.class);
        ObjectProvider<AiTranscriptionService> transcription = mock(ObjectProvider.class);
        TenantContextFactory tenants = mock(TenantContextFactory.class);
        AiReportSnapshotService snapshots = mock(AiReportSnapshotService.class);
        AiReportMetricsService metrics = mock(AiReportMetricsService.class);
        AiReportAuditService audit = mock(AiReportAuditService.class);
        TenantContext tenant = new TenantContext(42L, 7L, 3L, java.util.List.of(3L),
                java.util.Set.of(TenantContext.PERM_QUERY));
        AiReportSnapshotResponse expected = new AiReportSnapshotResponse(
                91L, "report_sales", "sales today", "Sales today", null, java.util.Map.of(), null);
        when(tenants.fromSecurity()).thenReturn(tenant);
        when(snapshots.getOwned(91L, tenant)).thenReturn(expected);
        AiAssistantController controller = new AiAssistantController(
                graph, transcription, tenants, snapshots, metrics, audit, mock(AiChatHistoryService.class));

        ApiResult<AiReportSnapshotResponse> result = controller.reportSnapshot(91L);

        assertSame(expected, result.data());
        verify(snapshots).getOwned(91L, tenant);
    }

    @SuppressWarnings("unchecked")
    private static AiAssistantController controller(
            ObjectProvider<PosAssistantGraphService> graph,
            ObjectProvider<AiTranscriptionService> transcription,
            TenantContextFactory tenants,
            AiReportAuditService audit) {
        return new AiAssistantController(
                graph,
                transcription,
                tenants,
                mock(AiReportSnapshotService.class),
                mock(AiReportMetricsService.class),
                audit,
                mock(AiChatHistoryService.class));
    }
}
