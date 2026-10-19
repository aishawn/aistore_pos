package com.orithos.modules.ai;

import java.util.Locale;

/**
 * DashScope host stays {@code https://dashscope.aliyuncs.com}; the failing
 * {@code InvalidParameter: url error} for models like {@code qwen3.8-flash} comes from using the
 * text-generation path. Those models must hit multimodal-generation (Spring AI's
 * {@code multi-model=true} switch).
 */
public final class DashScopeModelRouting {

    public static final String TEXT_COMPLETIONS_PATH =
            "/api/v1/services/aigc/text-generation/generation";
    public static final String MULTIMODAL_COMPLETIONS_PATH =
            "/api/v1/services/aigc/multimodal-generation/generation";

    private DashScopeModelRouting() {
    }

    /**
     * @return true when Spring AI Chat must set {@code multi-model} so the SDK posts to
     * multimodal-generation instead of text-generation
     */
    public static boolean requiresMultimodalEndpoint(String model) {
        if (model == null || model.isBlank()) {
            return false;
        }
        String m = model.trim().toLowerCase(Locale.ROOT);
        if (m.contains("vl") || m.startsWith("qvq")) {
            return true;
        }
        // qwen3.7+ / qwen3.8+ (e.g. qwen3.8-flash): text-generation returns url error
        return m.startsWith("qwen3.7") || m.startsWith("qwen3.8") || m.startsWith("qwen3.9")
                || m.matches("qwen3\\.\\d{2,}([.\\-].*)?");
    }

    public static String completionsPathForModel(String model) {
        return requiresMultimodalEndpoint(model) ? MULTIMODAL_COMPLETIONS_PATH : TEXT_COMPLETIONS_PATH;
    }
}
