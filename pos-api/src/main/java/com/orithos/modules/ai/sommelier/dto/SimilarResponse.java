package com.orithos.modules.ai.sommelier.dto;

import java.util.List;

public record SimilarResponse(
        Long productId,
        String direction,
        List<RecommendCard> items
) {}
