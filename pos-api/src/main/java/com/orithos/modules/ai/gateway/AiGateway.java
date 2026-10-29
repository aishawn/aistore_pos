package com.orithos.modules.ai.gateway;

/**
 * Anti-corruption boundary between POS workflows and a model provider.
 * Implementations must enforce provider allow-lists, schema validation,
 * retries/circuit breaking, redaction and tenant quotas before returning.
 */
public interface AiGateway {
    <T> AiCompletion<T> complete(
            AiTenantContext tenant,
            AiTask task,
            PromptVersion prompt,
            String input,
            Class<T> outputType);

    /** Convenience entry point for schema-bound outputs. */
    default <T> AiCompletion<T> completeStructured(
            AiTenantContext tenant, AiTask task, PromptVersion prompt, String input, Class<T> outputType) {
        if (outputType == null || outputType == String.class) {
            throw new IllegalArgumentException("a structured output type is required");
        }
        return complete(tenant, task, prompt, input, outputType);
    }

    /** Tool-enabled text completion for explicitly read-only application tools. */
    default AiCompletion<String> completeWithTools(AiTenantContext tenant, AiTask task,
                                                    PromptVersion prompt, String input,
                                                    String systemPrompt, Object... tools) {
        throw new UnsupportedOperationException("tool calling is not supported by this provider adapter");
    }

    /** Multimodal request for audio transcription and image extraction. */
    default AiCompletion<String> completeMedia(AiTenantContext tenant, AiTask task,
                                                String prompt, String mimeType, byte[] media,
                                                String languageHint) {
        throw new UnsupportedOperationException("media requests are not supported by this provider adapter");
    }
}
