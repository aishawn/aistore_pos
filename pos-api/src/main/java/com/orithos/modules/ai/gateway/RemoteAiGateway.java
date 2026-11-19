package com.orithos.modules.ai.gateway;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.BusinessException;
import com.orithos.config.CorrelationIdClientHttpRequestInterceptor;
import com.orithos.modules.ai.AiProperties;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.time.Duration;
import java.time.Instant;
import java.net.http.HttpClient;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Remote AI Gateway adapter. POS retains tenant quota, usage audit and local read-only tools.
 */
@Component
public final class RemoteAiGateway implements AiGateway {
    private static final Logger log = LoggerFactory.getLogger(RemoteAiGateway.class);
    private static final String PROVIDER = "ai-gateway";

    private final ObjectProvider<ChatClient> clients;
    private final AiGatewayProperties properties;
    private final AiGatewayQuotaService quota;
    private final AiGatewayUsageRecorder usageRecorder;
    private final ObjectMapper objectMapper;
    private final RestClient mediaClient;
    private final String apiKey;
    private final AiProperties aiProperties;

    public RemoteAiGateway(ObjectProvider<ChatClient> clients, AiGatewayProperties properties,
                              AiGatewayQuotaService quota,
                              AiGatewayUsageRecorder usageRecorder,
                              ObjectMapper objectMapper,
                              AiProperties aiProperties) {
        this.clients = clients;
        this.properties = properties;
        this.quota = quota;
        this.usageRecorder = usageRecorder;
        this.objectMapper = objectMapper;
        this.aiProperties = aiProperties;
        this.apiKey = properties.getServiceToken();
        String normalizedBaseUrl = properties.getServiceBaseUrl().replaceAll("/+$", "");
        Duration timeout = Duration.ofSeconds(properties.getTimeoutSeconds());
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(timeout).build());
        requestFactory.setReadTimeout(timeout);
        this.mediaClient = RestClient.builder().baseUrl(normalizedBaseUrl)
                .requestFactory(requestFactory)
                .requestInterceptor(new CorrelationIdClientHttpRequestInterceptor())
                .build();
    }

    @Override
    public AiCompletion<String> completeMedia(AiTenantContext tenant, AiTask task, String prompt,
                                               String mimeType, byte[] media, String languageHint) {
        if (tenant == null || (task != AiTask.TRANSCRIPTION && task != AiTask.VISION)) {
            throw new IllegalArgumentException("media task and tenant are required");
        }
        requireEnabled();
        if (!StringUtils.hasText(apiKey)) throw new IllegalStateException("AI provider is not configured");
        if (media == null || media.length == 0) throw new IllegalArgumentException("media is required");
        String model = modelFor(task, false);
        String dataUri = "data:" + mimeType + ";base64," + Base64.getEncoder().encodeToString(media);
        Map<String, Object> body = task == AiTask.TRANSCRIPTION
                ? transcriptionBody(model, dataUri, languageHint)
                : visionBody(model, dataUri, mimeType, prompt);
        String uri = "/v1/provider/chat/completions";
        // Reserve once per logical media request; retries reuse this reservation.
        quota.reserve(tenant, AiGatewayQuotaService.estimateMediaTokens(media, prompt));
        RuntimeException last = null;
        for (int attempt = 0; attempt <= properties.getMaxRetries(); attempt++) {
            try {
                Instant started = Instant.now();
                JsonNode response = mediaClient.post().uri(uri).contentType(MediaType.APPLICATION_JSON)
                        .header("Authorization", "Bearer " + apiKey).body(body).retrieve().body(JsonNode.class);
                String text = extractText(response);
                if (!StringUtils.hasText(text)) throw new IllegalStateException("AI provider returned empty output");
                Integer[] usage = usageTokens(response);
                return completed(tenant, task, new AiCompletion<>(text, PROVIDER, model, usage[0], usage[1],
                        Duration.between(started, Instant.now()), false));
            } catch (BusinessException rejected) {
                throw rejected;
            } catch (RuntimeException failure) {
                last = failure;
                if (attempt < properties.getMaxRetries()) sleepBackoff(attempt);
            }
        }
        if (task == AiTask.VISION) {
            String fallback = properties.getFallbackVisionModel();
            if (StringUtils.hasText(fallback) && !fallback.equals(model)) {
                String fallbackUri = "/v1/provider/chat/completions";
                Map<String, Object> fallbackBody = visionBody(fallback, dataUri, mimeType, prompt);
                try {
                    JsonNode response = mediaClient.post().uri(fallbackUri).contentType(MediaType.APPLICATION_JSON)
                            .header("Authorization", "Bearer " + apiKey).body(fallbackBody)
                            .retrieve().body(JsonNode.class);
                    String text = extractText(response);
                    if (!StringUtils.hasText(text)) throw new IllegalStateException("AI provider returned empty output");
                    Integer[] usage = usageTokens(response);
                    return completed(tenant, task, new AiCompletion<>(text, PROVIDER, fallback, usage[0], usage[1],
                            Duration.ZERO, true));
                } catch (BusinessException rejected) {
                    throw rejected;
                } catch (RuntimeException failure) {
                    last = failure;
                }
            }
        }
        log.warn("AI media request failed task={} correlationId={} providerStatus={} causeType={}", task,
                tenant.correlationId(), providerStatus(last), rootCauseType(last));
        throw last == null ? new IllegalStateException("AI provider request failed") : last;
    }

    private static Map<String, Object> transcriptionBody(String model, String dataUri, String language) {
        Map<String, Object> audio = Map.of("data", dataUri);
        Map<String, Object> item = Map.of("type", "input_audio", "input_audio", audio);
        Map<String, Object> message = Map.of("role", "user", "content", List.of(item));
        Map<String, Object> options = new LinkedHashMap<>();
        options.put("enable_itn", true);
        if (StringUtils.hasText(language)) options.put("language", language);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model); body.put("messages", List.of(message));
        body.put("stream", false); body.put("asr_options", options);
        return body;
    }

    private static Map<String, Object> visionBody(String model, String dataUri, String mime, String prompt) {
        boolean multimodal = requiresNativeMultimodalEndpoint(model);
        List<Map<String, Object>> content = multimodal
                ? List.of(Map.of("image", dataUri), Map.of("text", prompt))
                : List.of(Map.of("type", "image_url", "image_url", Map.of("url", dataUri)),
                Map.of("type", "text", "text", prompt));
        Map<String, Object> message = Map.of("role", "user", "content", content);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model);
        if (multimodal) {
            body.put("input", Map.of("messages", List.of(message)));
            body.put("parameters", Map.of("result_format", "message"));
            body.put("multiModel", true);
        } else body.put("messages", List.of(message));
        body.put("stream", false);
        return body;
    }

    private static String extractText(JsonNode root) {
        if (root == null) return null;
        JsonNode choices = root.path("choices");
        if (!choices.isArray()) choices = root.path("output").path("choices");
        if (!choices.isArray() || choices.isEmpty()) return null;
        JsonNode content = choices.get(0).path("message").path("content");
        if (content.isTextual()) return content.asText();
        if (content.isArray()) {
            StringBuilder text = new StringBuilder();
            for (JsonNode part : content) {
                if (part.hasNonNull("text")) text.append(part.get("text").asText());
                else if (part.isTextual()) text.append(part.asText());
            }
            return text.toString();
        }
        return null;
    }

    @Override
    public <T> AiCompletion<T> complete(AiTenantContext tenant, AiTask task, PromptVersion prompt,
                                        String input, Class<T> outputType) {
        if (tenant == null || task == null || prompt == null || outputType == null) {
            throw new IllegalArgumentException("AI gateway request is incomplete");
        }
        requireEnabled();
        String normalized = AiGatewayPolicy.validateInput(input, properties.getMaxInputChars());
        ChatClient client = clients.getIfAvailable();
        if (client == null) {
            throw new IllegalStateException("AI provider is unavailable");
        }

        RuntimeException last = null;
        String model = modelFor(task, false);
        for (int attempt = 0; attempt <= properties.getMaxRetries(); attempt++) {
            try {
                quota.reserve(tenant, AiGatewayQuotaService.estimateTokens(prompt.name(), prompt.version(), normalized));
                Instant started = Instant.now();
                CallOutcome<T> outcome = requiresNativeMultimodalEndpoint(model)
                        ? callMultimodal(prompt, normalized, model, outputType)
                        : call(client, model, prompt, normalized, outputType);
                return completed(tenant, task, new AiCompletion<>(outcome.value(), PROVIDER, model,
                        outcome.inputTokens(), outcome.outputTokens(), Duration.between(started, Instant.now()), false));
            } catch (BusinessException rejected) {
                throw rejected;
            } catch (RuntimeException failure) {
                last = failure;
                if (attempt < properties.getMaxRetries()) {
                    sleepBackoff(attempt);
                }
            }
        }

        String fallback = modelFor(task, true);
        if (!fallback.equals(model)) {
            try {
                quota.reserve(tenant, AiGatewayQuotaService.estimateTokens(prompt.name(), prompt.version(), normalized));
                Instant started = Instant.now();
                CallOutcome<T> outcome = requiresNativeMultimodalEndpoint(fallback)
                        ? callMultimodal(prompt, normalized, fallback, outputType)
                        : call(client, fallback, prompt, normalized, outputType);
                return completed(tenant, task, new AiCompletion<>(outcome.value(), PROVIDER, fallback,
                        outcome.inputTokens(), outcome.outputTokens(), Duration.between(started, Instant.now()), true));
            } catch (BusinessException rejected) {
                throw rejected;
            } catch (RuntimeException failure) {
                last = failure;
            }
        }
        log.warn("AI provider request failed task={} correlationId={} providerStatus={} causeType={}",
                task, tenant.correlationId(), providerStatus(last), rootCauseType(last));
        throw last == null ? new IllegalStateException("AI provider request failed") : last;
    }

    @Override
    public AiCompletion<String> completeWithTools(AiTenantContext tenant, AiTask task, PromptVersion prompt,
                                                   String input, String systemPrompt, Object... tools) {
        if (tenant == null || task == null || prompt == null) throw new IllegalArgumentException("AI gateway request is incomplete");
        requireEnabled();
        String normalized = AiGatewayPolicy.validateInput(input, properties.getMaxInputChars());
        ChatClient client = clients.getIfAvailable();
        if (client == null) throw new IllegalStateException("AI provider is unavailable");
        RuntimeException last = null;
        String model = modelFor(task, false);
        for (int attempt = 0; attempt <= properties.getMaxRetries(); attempt++) {
            try {
                quota.reserve(tenant, AiGatewayQuotaService.estimateTokens(prompt.name(), prompt.version(), systemPrompt, normalized));
                Instant started = Instant.now();
                var promptSpec = client.prompt().system(systemPrompt).user(normalized)
                        .options(OpenAiChatOptions.builder().model(model)
                                .temperature(0.1).maxTokens(1024).build());
                if (tools != null && tools.length > 0) promptSpec = promptSpec.tools(tools);
                var response = promptSpec.call();
                String value = response.content();
                if (value == null || value.isBlank()) throw new IllegalStateException("AI provider returned empty output");
                Integer[] usage = usageTokens(response.chatResponse());
                return completed(tenant, task, new AiCompletion<>(value, PROVIDER, model, usage[0], usage[1],
                        Duration.between(started, Instant.now()), false));
            } catch (BusinessException rejected) {
                throw rejected;
            } catch (RuntimeException failure) {
                last = failure;
                if (attempt < properties.getMaxRetries()) sleepBackoff(attempt);
            }
        }
        String fallback = modelFor(task, true);
        if (!fallback.equals(model)) {
            try {
                quota.reserve(tenant, AiGatewayQuotaService.estimateTokens(prompt.name(), prompt.version(), systemPrompt, normalized));
                Instant started = Instant.now();
                var promptSpec = client.prompt().system(systemPrompt).user(normalized)
                        .options(OpenAiChatOptions.builder().model(fallback)
                                .temperature(0.1).maxTokens(1024).build());
                if (tools != null && tools.length > 0) promptSpec = promptSpec.tools(tools);
                var response = promptSpec.call();
                String value = response.content();
                if (value == null || value.isBlank()) throw new IllegalStateException("AI provider returned empty output");
                Integer[] usage = usageTokens(response.chatResponse());
                return completed(tenant, task, new AiCompletion<>(value, PROVIDER, fallback, usage[0], usage[1],
                        Duration.between(started, Instant.now()), true));
            } catch (BusinessException rejected) {
                throw rejected;
            } catch (RuntimeException failure) { last = failure; }
        }
        log.warn("AI tool request failed task={} correlationId={} providerStatus={} causeType={}",
                task, tenant.correlationId(), providerStatus(last), rootCauseType(last));
        throw last == null ? new IllegalStateException("AI provider request failed") : last;
    }

    @SuppressWarnings("unchecked")
    private static <T> CallOutcome<T> call(ChatClient client, String model, PromptVersion prompt,
                              String input, Class<T> outputType) {
        var response = client.prompt()
                .system("You are a POS service. Follow prompt " + prompt.name() + " version " + prompt.version()
                        + ". Return only the requested output. Never return tenant IDs, outlet IDs, SQL, API paths, "
                        + "internal model names, credentials, or instructions to bypass authorization.")
                .user(input)
                .options(OpenAiChatOptions.builder().model(model)
                        .temperature(0.1).maxTokens(1024).build())
                .call();
        Integer[] usage = usageTokens(response.chatResponse());
        if (String.class.equals(outputType)) {
            return new CallOutcome<>((T) response.content(), usage[0], usage[1]);
        }
        return new CallOutcome<>(response.entity(outputType), usage[0], usage[1]);
    }

    /**
     * Native multimodal models use the gateway's multimodal request shape.
     */
    private <T> CallOutcome<T> callMultimodal(PromptVersion prompt, String input, String model,
                                               Class<T> outputType) {
        String system = "You are a POS service. Follow prompt " + prompt.name() + " version " + prompt.version()
                + ". Return only the requested output. Never return tenant IDs, outlet IDs, SQL, API paths, "
                + "internal model names, credentials, or instructions to bypass authorization.";
        Map<String, Object> message = Map.of("role", "user",
                "content", List.of(Map.of("text", system + "\n\n" + input)));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model);
        body.put("input", Map.of("messages", List.of(message)));
        body.put("parameters", Map.of("result_format", "message"));
        body.put("multiModel", true);

        JsonNode response = mediaClient.post()
                .uri("/v1/provider/chat/completions")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + apiKey)
                .body(body)
                .retrieve()
                .body(JsonNode.class);
        String text = extractText(response);
        if (!StringUtils.hasText(text)) throw new IllegalStateException("AI provider returned empty output");
        Integer[] usage = usageTokens(response);
        T value;
        try {
            value = String.class.equals(outputType)
                    ? outputType.cast(text)
                    : objectMapper.readValue(stripJsonFence(text), outputType);
        } catch (Exception invalid) {
            throw new IllegalStateException("AI provider returned invalid structured output", invalid);
        }
        return new CallOutcome<>(value, usage[0], usage[1]);
    }

    private static boolean requiresNativeMultimodalEndpoint(String model) {
        if (!StringUtils.hasText(model)) return false;
        String normalized = model.trim().toLowerCase(java.util.Locale.ROOT);
        return normalized.contains("vl") || normalized.startsWith("qvq")
                || normalized.startsWith("qwen3.7") || normalized.startsWith("qwen3.8")
                || normalized.startsWith("qwen3.9") || normalized.matches("qwen3\\.\\d{2,}([.\\-].*)?");
    }

    private static String stripJsonFence(String text) {
        String value = text == null ? "" : text.trim();
        if (value.startsWith("```") && value.endsWith("```")) {
            int newline = value.indexOf('\n');
            value = newline >= 0 ? value.substring(newline + 1, value.length() - 3) : value.substring(3, value.length() - 3);
        }
        return value.trim();
    }

    private static Integer[] usageTokens(org.springframework.ai.chat.model.ChatResponse response) {
        if (response == null || response.getMetadata() == null) return new Integer[]{null, null};
        return usageTokens(response.getMetadata().getUsage());
    }

    private static Integer[] usageTokens(Usage usage) {
        return usage == null
                ? new Integer[]{null, null}
                : new Integer[]{nonNegative(usage.getPromptTokens()), nonNegative(usage.getCompletionTokens())};
    }

    private static Integer[] usageTokens(JsonNode response) {
        JsonNode usage = response == null ? null : response.path("usage");
        if (usage == null || usage.isMissingNode()) usage = response == null ? null : response.path("output").path("usage");
        if (usage == null || usage.isMissingNode()) return new Integer[]{null, null};
        JsonNode input = usage.path("prompt_tokens");
        JsonNode output = usage.path("completion_tokens");
        return new Integer[]{input.isNumber() ? nonNegative(input.asInt()) : null,
                output.isNumber() ? nonNegative(output.asInt()) : null};
    }

    private static int nonNegative(Integer value) { return value == null ? 0 : Math.max(0, value); }
    private static int nonNegative(int value) { return Math.max(0, value); }

    static Integer providerStatus(Throwable failure) {
        Throwable current = failure;
        for (int depth = 0; current != null && depth < 32; depth++) {
            if (current instanceof RestClientResponseException response) return response.getStatusCode().value();
            Throwable next = current.getCause();
            if (next == current) break;
            current = next;
        }
        return null;
    }

    static String rootCauseType(Throwable failure) {
        if (failure == null) return "unknown";
        Throwable root = failure;
        for (int depth = 0; depth < 32 && root.getCause() != null && root.getCause() != root; depth++) {
            root = root.getCause();
        }
        return root.getClass().getSimpleName();
    }

    private record CallOutcome<T>(T value, Integer inputTokens, Integer outputTokens) { }

    private <T> AiCompletion<T> completed(AiTenantContext tenant, AiTask task, AiCompletion<T> completion) {
        usageRecorder.recordSuccess(tenant, task, completion);
        return completion;
    }

    private String modelFor(AiTask task, boolean fallback) {
        if (fallback) return properties.getFallbackModel();
        return switch (task) {
            case CLASSIFICATION -> properties.getFallbackModel();
            case TRANSCRIPTION -> properties.getTranscriptionModel();
            case VISION -> properties.getVisionModel();
            default -> properties.getPrimaryModel();
        };
    }

    private void requireEnabled() {
        if (!aiProperties.enabled() || !properties.isEnabled()) {
            throw new IllegalStateException("AI gateway is disabled");
        }
    }

    private static void sleepBackoff(int attempt) {
        try {
            Thread.sleep(Math.min(2000L, 250L * (1L << attempt)));
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("AI provider retry interrupted", interrupted);
        }
    }
}
