package com.orithos.modules.product;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class CompetitorPriceObservation {
    private Long id;
    private Long productId;
    private Long sourceId;
    private String competitor;
    private String sourceType;
    private String competitorProductName;
    private String barcode;
    private Integer volumeMl;
    private String vintage;
    private Integer packSize;
    private String priceType;
    private String priceTaxBasis;
    private BigDecimal observedPrice;
    private BigDecimal memberPrice;
    private BigDecimal unitPrice;
    private String unitPriceBasis;
    private String promotionTerms;
    private LocalDateTime promotionStartsAt;
    private LocalDateTime promotionEndsAt;
    private String postcode;
    private String fulfillment;
    private String sourceUrl;
    private String evidenceUrl;
    private String captureMethod;
    private String matchMethod;
    private BigDecimal matchConfidence;
    private String reviewStatus;
    private String matchReviewStatus;
    private String priceReviewStatus;
    private LocalDateTime observedAt;
    private String observedTimezone;
    private LocalDateTime verifiedAt;
    private Long createdBy;
    private String reviewNote;
}
