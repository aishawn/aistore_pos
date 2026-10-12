package com.orithos.modules.ai.sommelier.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record SimilarRequest(
        @NotNull Long productId,
        @NotBlank String direction
) {}
