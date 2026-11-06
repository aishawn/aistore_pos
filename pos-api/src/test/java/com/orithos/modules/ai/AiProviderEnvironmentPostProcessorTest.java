package com.orithos.modules.ai;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.model.openai.autoconfigure.OpenAiChatAutoConfiguration;
import org.springframework.ai.model.tool.autoconfigure.ToolCallingAutoConfiguration;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.web.client.RestClientAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.ai.retry.autoconfigure.SpringAiRetryAutoConfiguration;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AiProviderEnvironmentPostProcessorTest {

    private final AiProviderEnvironmentPostProcessor processor = new AiProviderEnvironmentPostProcessor();

    @Test
    void remoteProviderSelectsSpringAiOpenAiModel() {
        var environment = environment(Map.of("AI_PROVIDER", "remote"));
        processor.postProcessEnvironment(environment, new SpringApplication());
        assertEquals("openai", environment.getProperty("spring.ai.model.chat"));
    }

    @Test
    void dashscopeRemainsTheDefaultProvider() {
        var environment = environment(Map.of());
        processor.postProcessEnvironment(environment, new SpringApplication());
        assertEquals("dashscope", environment.getProperty("spring.ai.model.chat"));
    }

    @Test
    void rejectsUnknownProvider() {
        var environment = environment(Map.of("AI_PROVIDER", "unknown"));
        assertThrows(IllegalStateException.class,
                () -> processor.postProcessEnvironment(environment, new SpringApplication()));
    }

    @Test
    void remoteSpringAiConfigurationCreatesAChatModel() {
        new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(
                        RestClientAutoConfiguration.class,
                        ToolCallingAutoConfiguration.class,
                        SpringAiRetryAutoConfiguration.class,
                        OpenAiChatAutoConfiguration.class))
                .withPropertyValues(
                        "spring.ai.model.chat=openai",
                        "spring.ai.openai.api-key=test-token",
                        "spring.ai.openai.chat.base-url=https://ai.example.invalid/v1/provider",
                        "spring.ai.openai.chat.completions-path=/chat/completions")
                .run(context -> assertEquals(1, context.getBeansOfType(ChatModel.class).size()));
    }

    private static StandardEnvironment environment(Map<String, Object> values) {
        var environment = new StandardEnvironment();
        environment.getPropertySources().addFirst(new MapPropertySource("test", values));
        return environment;
    }
}
