package com.orithos.modules.ai.sommelier.dto;

import java.math.BigDecimal;
import java.util.List;

public record WineAssistantResponse(
        Long productId,
        String name,
        String brandName,
        String categoryName,
        String image,
        BigDecimal listPrice,
        BigDecimal sellPrice,
        boolean onPromotion,
        BigDecimal stockQuantity,
        BigDecimal caseQuantity,
        String wineType,
        String varietal,
        String region,
        String vintage,
        String drynessLabel,
        String bodyLabel,
        List<String> aromaTags,
        List<String> palateTags,
        List<String> foodTags,
        String finishNote,
        String pitch,
        String pitch10s,
        String pitch30s,
        boolean inferred,
        String promotionEndsAt,
        String promotionEndDateStatus
) {
    public WineAssistantResponse(Long productId, String name, String brandName, String categoryName,
                                 String image, BigDecimal listPrice, BigDecimal sellPrice, boolean onPromotion,
                                 BigDecimal stockQuantity, BigDecimal caseQuantity, String wineType, String varietal,
                                 String region, String vintage, String drynessLabel, String bodyLabel,
                                 List<String> aromaTags, List<String> palateTags, List<String> foodTags,
                                 String finishNote, String pitch, String pitch10s, String pitch30s, boolean inferred) {
        this(productId, name, brandName, categoryName, image, listPrice, sellPrice, onPromotion, stockQuantity,
                caseQuantity, wineType, varietal, region, vintage, drynessLabel, bodyLabel, aromaTags, palateTags,
                foodTags, finishNote, pitch, pitch10s, pitch30s, inferred, null, "UNVERIFIED");
    }

    public WineAssistantResponse(Long productId, String name, String brandName, String categoryName,
                                 String image, BigDecimal listPrice, BigDecimal sellPrice, boolean onPromotion,
                                 BigDecimal stockQuantity, BigDecimal caseQuantity, String wineType, String varietal,
                                 String region, String vintage, String drynessLabel, String bodyLabel,
                                 List<String> aromaTags, List<String> palateTags, List<String> foodTags,
                                 String finishNote, String pitch, String pitch10s, String pitch30s, boolean inferred,
                                 String promotionEndsAt) {
        this(productId, name, brandName, categoryName, image, listPrice, sellPrice, onPromotion, stockQuantity,
                caseQuantity, wineType, varietal, region, vintage, drynessLabel, bodyLabel, aromaTags, palateTags,
                foodTags, finishNote, pitch, pitch10s, pitch30s, inferred, promotionEndsAt,
                promotionEndsAt == null ? "UNVERIFIED" : "VERIFIED_END_DATE");
    }
}
