package com.orithos.modules.ai;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.Map;

/**
 * Aligns Spring AI's default DashScope model flag before beans are created.
 *
 * <p>{@code AI_DASHSCOPE_BASE_URL} must remain the host only
 * ({@code https://dashscope.aliyuncs.com}). Do not append {@code /api/v1} or
 * {@code /compatible-mode/v1} — the SDK appends the generation path.
 */
public class DashScopeEnvironmentPostProcessor implements EnvironmentPostProcessor {

    static final String PROPERTY_SOURCE = "orithosDashScopeRouting";
    static final String MULTI_MODEL_PROPERTY = "spring.ai.dashscope.chat.options.multi-model";
    static final String COMPLETIONS_PATH_PROPERTY = "spring.ai.dashscope.chat.completions-path";

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        String model = firstNonBlank(
                environment.getProperty("AI_DASHSCOPE_MODEL"),
                environment.getProperty("spring.ai.dashscope.chat.options.model"),
                "qwen-plus");

        // Only honor an explicit operator override. Do not treat application.yml defaults as final.
        Boolean explicit = parseBoolean(environment.getProperty("AI_DASHSCOPE_MULTI_MODEL"));
        boolean requiresMultimodal = DashScopeModelRouting.requiresMultimodalEndpoint(model);
        // A text-only endpoint is invalid for multimodal-capable models such as
        // qwen3.8-flash and produces DashScope's opaque "url error" response.
        // Keep the deployment safe even when an old Compose env still says false.
        boolean multiModel = requiresMultimodal || Boolean.TRUE.equals(explicit);

        Map<String, Object> props = new HashMap<>();
        props.put(MULTI_MODEL_PROPERTY, multiModel);

        String pathOverride = environment.getProperty("AI_DASHSCOPE_COMPLETIONS_PATH");
        if (StringUtils.hasText(pathOverride)) {
            props.put(COMPLETIONS_PATH_PROPERTY, pathOverride.trim());
        } else {
            // Keep text-generation as fallback; multiModel=true forces multimodal per request.
            props.put(COMPLETIONS_PATH_PROPERTY, DashScopeModelRouting.TEXT_COMPLETIONS_PATH);
        }

        environment.getPropertySources().addFirst(new MapPropertySource(PROPERTY_SOURCE, props));
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value.trim();
            }
        }
        return "";
    }

    private static Boolean parseBoolean(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        String v = raw.trim().toLowerCase();
        if ("true".equals(v) || "1".equals(v) || "yes".equals(v)) {
            return true;
        }
        if ("false".equals(v) || "0".equals(v) || "no".equals(v)) {
            return false;
        }
        return null;
    }
}
