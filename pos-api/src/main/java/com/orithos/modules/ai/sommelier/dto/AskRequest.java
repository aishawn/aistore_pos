package com.orithos.modules.ai.sommelier.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record AskRequest(
        @NotNull Long productId,
        @NotBlank @Size(max = 500) String question
) {}
