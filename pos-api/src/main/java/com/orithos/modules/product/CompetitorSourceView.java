package com.orithos.modules.product;

import lombok.Data;

@Data
public class CompetitorSourceView {
    private Long id;
    private String sourceKey;
    private String name;
    private String baseUrl;
    private String sourceType;
    private String accessMode;
    private String termsUrl;
    private java.time.LocalDateTime termsReviewedAt;
    private String reviewSummary;
    private String permittedFields;
    private String retentionTerms;
    private String rateLimitTerms;
    private boolean enabled;
    private String postcode;
    private String fulfillment;
    private int refreshDays;
}
