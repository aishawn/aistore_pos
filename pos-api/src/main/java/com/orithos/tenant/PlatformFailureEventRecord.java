package com.orithos.tenant;

import java.time.LocalDateTime;

public record PlatformFailureEventRecord(
        String eventId,
        String fingerprint,
        String correlationId,
        String environment,
        String service,
        String runtimeCommit,
        Long tenantId,
        String tenantName,
        String tenantSlug,
        Long actorId,
        String actorUsername,
        String httpMethod,
        String requestPath,
        Integer httpStatus,
        Integer errorCode,
        String errorType,
        String errorSummary,
        Long durationMs,
        LocalDateTime occurredAt) {}
