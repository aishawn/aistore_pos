package com.orithos.modules.ai.sommelier.dto;

import jakarta.validation.constraints.NotNull;

public record PitchRequest(
        @NotNull Long productId,
        String length,
        RecommendRequest profile
) {
    public PitchRequest {
        length = (length == null || length.isBlank()) ? "card" : length.trim().toLowerCase();
    }
}
