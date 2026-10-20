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
        when(service.ask(eq("What should I reorder?"), isNull(), any(TenantContext.class)))
                .thenThrow(new IllegalStateException("provider request id=secret-123"));
        TenantContext tenant = new TenantContext(42L, 7L, 3L, java.util.List.of(3L),
                java.util.Set.of(TenantContext.PERM_QUERY));
        TenantContextFactory tenants = mock(TenantContextFactory.class);
        when(tenants.fromSecurity()).thenReturn(tenant);
        AiReportAuditService audit = mock(AiReportAuditService.class);
        AiAssistantController controller = controller(graph, mock(ObjectProvider.class), tenants, audit);
        ReflectionTestUtils.setField(controller, "dashScopeBaseUrl", "https://dashscope.aliyuncs.com");

        BusinessException error = assertThrows(BusinessException.class,
                () -> controller.assistant(new AssistantRequest("What should I reorder?", null)));

        assertEquals(50210, error.getCode());
        assertFalse(error.getMessage().contains("secret-123"));
        assertTrue(error.getMessage().contains("temporarily unavailable"));
        verify(audit).recordAssistant(eq(tenant), eq("unknown"), eq(false), anyInt(),
                eq("What should I reorder?"), isNull());
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
