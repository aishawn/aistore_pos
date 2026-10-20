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
        List<PathMetric> byPath,
        Highlights highlights
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
            Integer p50LatencyMs,
            Integer p95LatencyMs,
            long estimatedTokens
    ) {}

    /** Ops cards: last-24h activity + top intents (aggregates only, no Q/A text). */
    public record Highlights(
            long last24hRequests,
            long last24hRejected,
            double last24hRejectedRate,
            List<PathMetric> topIntents
    ) {}
}
