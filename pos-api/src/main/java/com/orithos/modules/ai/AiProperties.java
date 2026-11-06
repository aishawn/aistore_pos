package com.orithos.modules.ai;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.ai")
public record AiProperties(
        boolean enabled,
        String graphName,
/** Remote ASR model for Voice → text (default qwen3-asr-flash). */
        String transcriptionModel,
/** Remote vision model for wine-label OCR (default qwen-vl-plus). */
        String visionModel,
        /**
         * Optional lighter model for intent classify only. Empty = use the primary
* The remote AI Gateway chat model (usually qwen-plus).
         */
        String classifyModel,
        double temperature,
        int maxTokens,
        int timeoutSeconds,
        int conversationMemoryTurns,
        int conversationMemoryTtlMinutes
) {
    public AiProperties {
        if (graphName == null || graphName.isBlank()) {
            graphName = "pos-assistant";
        }
        if (transcriptionModel == null || transcriptionModel.isBlank()) {
            transcriptionModel = "qwen3-asr-flash";
        }
        if (visionModel == null || visionModel.isBlank()) {
            visionModel = "qwen-vl-plus";
        }
        if (classifyModel == null) {
            classifyModel = "";
        }
        if (temperature < 0) {
            temperature = 0.1;
        }
        if (maxTokens <= 0) {
            maxTokens = 1024;
        }
        if (timeoutSeconds <= 0) {
            timeoutSeconds = 40;
        }
        if (conversationMemoryTurns <= 0) {
            conversationMemoryTurns = 6;
        }
        if (conversationMemoryTtlMinutes <= 0) {
            conversationMemoryTtlMinutes = 120;
        }
    }
}
