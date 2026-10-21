package com.orithos.tenant;

import java.time.LocalDateTime;

public record PlatformFailureEvent(
        String fingerprint,
        String environment,
        String service,
        Long tenantId,
        String tenantName,
        String tenantSlug,
        String httpMethod,
        String requestPath,
        Integer httpStatus,
        Integer errorCode,
        String errorType,
        String errorSummary,
        Long occurrences,
        Long latestDurationMs,
        LocalDateTime firstSeenAt,
        LocalDateTime lastSeenAt,
        String latestCorrelationId,
        String runtimeCommit) {}
