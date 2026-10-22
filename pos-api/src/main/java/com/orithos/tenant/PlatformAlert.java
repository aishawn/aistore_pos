package com.orithos.tenant;

import java.time.LocalDateTime;

public record PlatformAlert(
        String fingerprint, String environment, String service, Long tenantId,
        String status, String assignee, String acknowledgementNote, String resolutionNote,
        LocalDateTime firstSeenAt, LocalDateTime lastSeenAt, Long occurrenceCount,
        String latestCorrelationId, String runtimeCommit, LocalDateTime acknowledgedAt,
        LocalDateTime resolvedAt, LocalDateTime updatedAt) {}
