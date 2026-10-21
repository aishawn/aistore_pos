package com.orithos.tenant;

import java.time.LocalDateTime;

public record PlatformAdminAuditEntry(
        Long id,
        String eventId,
        String correlationId,
        Long tenantId,
        String tenantName,
        String tenantSlug,
        Long actorId,
        String actorUsername,
        String action,
        String targetType,
        String targetId,
        String reason,
        String outcome,
        String beforeSummary,
        String afterSummary,
        Integer errorCode,
        String errorType,
        LocalDateTime createdAt,
        LocalDateTime completedAt) {}
