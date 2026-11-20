package com.orithos.modules.ai.sommelier.dto;

import java.math.BigDecimal;
import java.util.List;

public record RecommendCard(
        Long productId,
        String name,
        String tier,
        String badge,
        BigDecimal listPrice,
        BigDecimal sellPrice,
        boolean onPromotion,
        BigDecimal stockQuantity,
        BigDecimal caseQuantity,
        int matchPct,
        int drynessPct,
        int bodyPct,
        int foodPct,
        int businessFitPct,
        int confidencePct,
        String wineType,
        String varietal,
        String drynessLabel,
        String bodyLabel,
        List<String> aromaTags,
        List<String> palateTags,
        List<String> foodTags,
        String finishNote,
        String pitch,
        String whyUpgrade,
        boolean inferred
) {}
