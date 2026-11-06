package com.orithos.modules.ai;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

import java.util.Map;

/** Selects the matching Spring AI model auto-configuration from the POS provider setting. */
public class AiProviderEnvironmentPostProcessor implements EnvironmentPostProcessor {

    static final String PROPERTY_SOURCE = "orithosAiProvider";
    static final String CHAT_MODEL_PROPERTY = "spring.ai.model.chat";

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        String provider = environment.getProperty("AI_PROVIDER", "dashscope").trim().toLowerCase();
        String modelProvider = switch (provider) {
            case "remote" -> "openai";
            case "dashscope" -> "dashscope";
            default -> throw new IllegalStateException("AI_PROVIDER must be 'remote' or 'dashscope'");
        };
        environment.getPropertySources().addFirst(new MapPropertySource(PROPERTY_SOURCE,
                Map.of(CHAT_MODEL_PROPERTY, modelProvider)));
    }
}
