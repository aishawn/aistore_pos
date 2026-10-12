package com.orithos.modules.ai.sommelier.dto;

import com.orithos.modules.ai.sommelier.CustomerWineProfile;

import java.util.List;

public record RecommendResponse(
        CustomerWineProfile profile,
        List<RecommendCard> recommendations,
        String emptyReason
) {}
