package com.orithos.tenant;

import java.time.LocalDateTime;

public record TenantProvisionAttemptStep(
        String stepId,
        String attemptId,
        String stepName,
        String outcome,
        String resourceRef,
        String errorType,
        String errorSummary,
        LocalDateTime startedAt,
        LocalDateTime completedAt) {}
