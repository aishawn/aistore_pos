package com.orithos.modules.ai.decision;

import com.orithos.common.BusinessException;
import com.orithos.modules.ai.pricing.NativePriceSuggestionService;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.replenishment.NativeReplenishmentService;
import com.orithos.security.PermissionAccess;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiDecisionServiceTest {
    private final NativePriceSuggestionService pricing = mock(NativePriceSuggestionService.class);
    private final NativeReplenishmentService replenishment = mock(NativeReplenishmentService.class);
    private final AiDecisionRepository repository = mock(AiDecisionRepository.class);
    private final PermissionAccess permissions = mock(PermissionAccess.class);
    private final AiDecisionService service = new AiDecisionService(pricing, replenishment, repository, permissions);
    private final TenantContext tenant = new TenantContext(7, 11, 13L, List.of(13L), Set.of());

    @Test
    void replenishmentHistoryRequiresReplenishmentPermission() {
        service.list(tenant, "replenishment", 10);

        verify(permissions).requirePermission("stock.replenishment");
        verify(permissions, never()).requirePermission("ai.price_suggestions");
        verify(repository).list(tenant, "REPLENISHMENT", 10);
    }

    @Test
    void replenishmentFeedbackRequiresReplenishmentPermission() {
        UUID snapshotId = UUID.randomUUID();
        when(repository.decisionType(tenant, snapshotId)).thenReturn("REPLENISHMENT");

        service.feedback(tenant, snapshotId, new AiDecisionService.FeedbackRequest("ACCEPTED", null, null, null));

        verify(permissions).requirePermission("stock.replenishment");
        verify(repository).feedback(tenant, snapshotId, "ACCEPTED", null, null, null);
    }

    @Test
    void deniedFeedbackDoesNotWriteAudit() {
        UUID snapshotId = UUID.randomUUID();
        when(repository.decisionType(tenant, snapshotId)).thenReturn("PRICING");
        doThrow(new BusinessException(40300, "forbidden"))
                .when(permissions).requirePermission("ai.price_suggestions");

        assertThrows(BusinessException.class, () -> service.feedback(tenant, snapshotId,
                new AiDecisionService.FeedbackRequest("ACCEPTED", null, null, null)));

        verify(repository, never()).feedback(tenant, snapshotId, "ACCEPTED", null, null, null);
    }

    @Test
    void missingSnapshotDoesNotReachPermissionOrAuditWrite() {
        UUID snapshotId = UUID.randomUUID();
        when(repository.decisionType(tenant, snapshotId))
                .thenThrow(new BusinessException(40410, "not found"));

        assertThrows(BusinessException.class, () -> service.feedback(tenant, snapshotId,
                new AiDecisionService.FeedbackRequest("ACCEPTED", null, null, null)));

        verify(permissions, never()).requirePermission("ai.price_suggestions");
        verify(repository, never()).feedback(tenant, snapshotId, "ACCEPTED", null, null, null);
    }
}
