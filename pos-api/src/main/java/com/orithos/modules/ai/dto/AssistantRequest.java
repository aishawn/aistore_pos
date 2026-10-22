package com.orithos.modules.ai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AssistantRequest(
        @NotBlank @Size(max = 4000) String question,
        @Size(max = 128) String threadId,
        /** Optional UI surface hint (sell/products/stock/…); never a tenant key. */
        @Size(max = 32) String surface
) {
    public AssistantRequest(String question, String threadId) {
        this(question, threadId, null);
    }
}
