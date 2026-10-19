package com.orithos.modules.ai.report;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Safe, vendor-scoped report audit metrics. Token values are explicitly estimates
 * derived from stored prompt/SQL character counts, not provider billing usage.
 */
public record AiReportMetricsResponse(
        int windowHours,
        LocalDateTime since,
        LocalDateTime generatedAt,
        Summary summary,
        List<PathMetric> byPath
) {
    public record Summary(
            long requests,
            long allowed,
            long rejected,
            double allowedRate,
            double averageLatencyMs,
            Integer p50LatencyMs,
            Integer p95LatencyMs,
            long estimatedTokens,
            boolean estimatedTokensOnly
    ) {}

    public record PathMetric(
            String path,
            long requests,
            long allowed,
            long rejected,
            double allowedRate,
            double averageLatencyMs,
            long estimatedTokens
    ) {}
}
