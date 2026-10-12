package com.orithos.modules.ai.sommelier.dto;

import java.util.List;

public record AskResponse(
        String answer,
        List<RecommendCard> alternatives
) {}
