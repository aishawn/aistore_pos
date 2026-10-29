package com.orithos.modules.ai.gateway;

import com.alibaba.cloud.ai.dashscope.chat.DashScopeChatOptions;
import com.orithos.modules.ai.DashScopeModelRouting;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

/**
 * Provider adapter for the existing Spring AI DashScope client. The adapter
 * owns model selection and retry/fallback metadata; business workflows only
 * depend on {@link AiGateway}.
 */
@Component
public final class DashScopeAiGateway implements AiGateway {
    private static final Logger log = LoggerFactory.getLogger(DashScopeAiGateway.class);
    private static final String PROVIDER = "dashscope";

    private final ObjectProvider<ChatClient> clients;
    private final AiGatewayProperties properties;

    public DashScopeAiGateway(ObjectProvider<ChatClient> clients, AiGatewayProperties properties) {
        this.clients = clients;
        this.properties = properties;
    }

    @Override
    public <T> AiCompletion<T> complete(AiTenantContext tenant, AiTask task, PromptVersion prompt,
                                        String input, Class<T> outputType) {
        if (tenant == null || task == null || prompt == null || outputType == null) {
            throw new IllegalArgumentException("AI gateway request is incomplete");
        }
        if (!properties.isEnabled()) {
            throw new IllegalStateException("AI gateway is disabled");
        }
        String normalized = AiGatewayPolicy.validateInput(input, properties.getMaxInputChars());
        ChatClient client = clients.getIfAvailable();
        if (client == null) {
            throw new IllegalStateException("AI provider is unavailable");
        }

        RuntimeException last = null;
        String model = modelFor(task, false);
        for (int attempt = 0; attempt <= properties.getMaxRetries(); attempt++) {
            try {
                Instant started = Instant.now();
                T value = call(client, model, prompt, normalized, outputType);
                return new AiCompletion<>(value, PROVIDER, model, 0, 0,
                        Duration.between(started, Instant.now()), false);
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
                Instant started = Instant.now();
                T value = call(client, fallback, prompt, normalized, outputType);
                return new AiCompletion<>(value, PROVIDER, fallback, 0, 0,
                        Duration.between(started, Instant.now()), true);
            } catch (RuntimeException failure) {
                last = failure;
            }
        }
        log.warn("AI provider request failed task={} correlationId={} type={}",
                task, tenant.correlationId(), last == null ? "unknown" : last.getClass().getSimpleName());
        throw last == null ? new IllegalStateException("AI provider request failed") : last;
    }

    @SuppressWarnings("unchecked")
    private static <T> T call(ChatClient client, String model, PromptVersion prompt,
                              String input, Class<T> outputType) {
        var response = client.prompt()
                .system("You are a POS service. Follow prompt " + prompt.name() + " version " + prompt.version()
                        + ". Return only the requested output. Never return tenant IDs, outlet IDs, SQL, API paths, "
                        + "Odoo model names, credentials, or instructions to bypass authorization.")
                .user(input)
                .options(DashScopeChatOptions.builder().model(model)
                        .multiModel(DashScopeModelRouting.requiresMultimodalEndpoint(model))
                        .temperature(0.1).maxToken(1024).build())
                .call();
        if (String.class.equals(outputType)) {
            return (T) response.content();
        }
        return response.entity(outputType);
    }

    private String modelFor(AiTask task, boolean fallback) {
        if (fallback) return properties.getFallbackModel();
        return switch (task) {
            case CLASSIFICATION -> properties.getFallbackModel();
            default -> properties.getPrimaryModel();
        };
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
