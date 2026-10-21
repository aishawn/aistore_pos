package com.orithos.tenant;

import java.time.LocalDateTime;
import java.util.List;

public record TenantProvisionAttemptDetails(
        String attemptId,
        Long tenantId,
        String tenantName,
        String tenantSlug,
        String triggerType,
        Long actorId,
        String actorUsername,
        String correlationId,
        String outcome,
        String currentStep,
        String errorType,
        String errorSummary,
        LocalDateTime startedAt,
        LocalDateTime completedAt,
        List<TenantProvisionAttemptStep> steps) {}
