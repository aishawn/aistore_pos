package com.orithos.modules.ai;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.ai")
public record AiProperties(
        boolean enabled,
        String graphName,
        /** DashScope ASR model for Voice → text (default qwen3-asr-flash). */
        String transcriptionModel,
        /** DashScope vision model for wine-label OCR (default qwen-vl-plus). */
        String visionModel
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
    }
}
