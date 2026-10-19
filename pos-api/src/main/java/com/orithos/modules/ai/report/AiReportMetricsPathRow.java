package com.orithos.modules.ai.report;

/** Per-report-path aggregate. Raw questions and generated SQL are never returned. */
public record AiReportMetricsPathRow(
        String path,
        long requests,
        long allowed,
        long rejected,
        double averageLatencyMs,
        long estimatedTokens
) {}
