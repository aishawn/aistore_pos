package com.orithos.modules.ai.sommelier.dto;

public record PitchResponse(
        Long productId,
        String length,
        String text
) {}
