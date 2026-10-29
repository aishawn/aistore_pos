package com.orithos.modules.ai.gateway;

import java.time.Duration;

/** Provider-independent result metadata for cost, latency and fallback audits. */
public record AiCompletion<T>(
        T value,
        String provider,
        String model,
        int inputTokens,
        int outputTokens,
        Duration latency,
        boolean fallback
) {
    public AiCompletion {
        if (value == null || provider == null || provider.isBlank() || model == null || model.isBlank()) {
            throw new IllegalArgumentException("AI completion metadata is incomplete");
        }
        inputTokens = Math.max(0, inputTokens);
        outputTokens = Math.max(0, outputTokens);
        latency = latency == null ? Duration.ZERO : latency;
    }
}
