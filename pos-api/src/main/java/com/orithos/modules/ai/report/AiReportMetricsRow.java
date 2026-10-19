package com.orithos.modules.ai.report;

/** Aggregate for the tenant-scoped AI report audit table. */
public record AiReportMetricsRow(
        long requests,
        long allowed,
        long rejected,
        double averageLatencyMs,
        long estimatedTokens
) {}
