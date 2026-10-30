package com.orithos.modules.ai.gateway;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/** Operational defaults for the provider adapter. Secrets stay in environment variables. */
@Component
@ConfigurationProperties(prefix = "app.ai.gateway")
public class AiGatewayProperties {
    private boolean enabled = true;
    private int maxInputChars = 12000;
    private int maxRetries = 2;
    private int timeoutSeconds = 40;
    private int requestsPerMinute = 60;
    private int tokensPerHour = 200000;
    private String primaryModel = "qwen-plus";
    private String fallbackModel = "qwen-flash";
    private String transcriptionModel = "qwen3-asr-flash";
    private String visionModel = "qwen3.8-flash";
    private String fallbackVisionModel = "qwen-vl-plus";

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public int getMaxInputChars() { return maxInputChars; }
    public void setMaxInputChars(int maxInputChars) { this.maxInputChars = Math.max(100, maxInputChars); }
    public int getMaxRetries() { return maxRetries; }
    public void setMaxRetries(int maxRetries) { this.maxRetries = Math.max(0, Math.min(5, maxRetries)); }
    public int getTimeoutSeconds() { return timeoutSeconds; }
    public void setTimeoutSeconds(int timeoutSeconds) { this.timeoutSeconds = Math.max(1, timeoutSeconds); }
    public int getRequestsPerMinute() { return requestsPerMinute; }
    public void setRequestsPerMinute(int requestsPerMinute) { this.requestsPerMinute = Math.max(1, requestsPerMinute); }
    public int getTokensPerHour() { return tokensPerHour; }
    public void setTokensPerHour(int tokensPerHour) { this.tokensPerHour = Math.max(1, tokensPerHour); }
    public String getPrimaryModel() { return primaryModel; }
    public void setPrimaryModel(String primaryModel) { if (primaryModel != null && !primaryModel.isBlank()) this.primaryModel = primaryModel.trim(); }
    public String getFallbackModel() { return fallbackModel; }
    public void setFallbackModel(String fallbackModel) { if (fallbackModel != null && !fallbackModel.isBlank()) this.fallbackModel = fallbackModel.trim(); }
    public String getTranscriptionModel() { return transcriptionModel; }
    public void setTranscriptionModel(String transcriptionModel) { if (transcriptionModel != null && !transcriptionModel.isBlank()) this.transcriptionModel = transcriptionModel.trim(); }
    public String getVisionModel() { return visionModel; }
    public void setVisionModel(String visionModel) { if (visionModel != null && !visionModel.isBlank()) this.visionModel = visionModel.trim(); }
    public String getFallbackVisionModel() { return fallbackVisionModel; }
    public void setFallbackVisionModel(String fallbackVisionModel) { if (fallbackVisionModel != null && !fallbackVisionModel.isBlank()) this.fallbackVisionModel = fallbackVisionModel.trim(); }
}
