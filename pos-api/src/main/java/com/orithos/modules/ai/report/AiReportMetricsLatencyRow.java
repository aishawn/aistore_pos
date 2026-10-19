package com.orithos.modules.ai.report;

/** One latency sample for a vendor-scoped AI path. */
public record AiReportMetricsLatencyRow(String path, Integer latencyMs) {}
