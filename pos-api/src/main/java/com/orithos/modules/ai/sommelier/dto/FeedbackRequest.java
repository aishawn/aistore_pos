package com.orithos.modules.ai.sommelier.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record FeedbackRequest(
        @NotNull Long productId,
        @NotBlank String reaction,
        RecommendRequest profile
) {}
