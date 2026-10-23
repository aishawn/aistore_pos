package com.orithos.modules.ai.grocery;

import java.util.List;

public record GroceryRecommendResponse(
        GroceryRecommendRequest profile,
        List<GroceryRecommendCard> recommendations,
        String emptyReason
) {}
