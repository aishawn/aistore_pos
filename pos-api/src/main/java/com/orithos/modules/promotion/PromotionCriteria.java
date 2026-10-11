package com.orithos.modules.promotion;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class PromotionCriteria {
    private Long id;
    private Long promotionId;
    private String type;
    private BigDecimal buyAmount;
    private BigDecimal buyAmountMax;
    private String buyAmountType;
    private BigDecimal discountAmount;
    private BigDecimal minQuantity;
    private String quantityType;
    private Boolean mixedOnly;
    private Boolean optional;
}
