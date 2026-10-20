package com.orithos.modules.ai.report;

import java.time.LocalDateTime;

public record AiPlatformVendorMetricsRow(
        long vendorId,
        long requests,
        long allowed,
        long rejected,
        double averageLatencyMs,
        long estimatedTokens,
        LocalDateTime lastSeenAt
) {}
