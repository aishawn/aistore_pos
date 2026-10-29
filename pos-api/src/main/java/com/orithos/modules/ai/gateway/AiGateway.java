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
}
