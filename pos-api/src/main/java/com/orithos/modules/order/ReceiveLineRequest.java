package com.orithos.modules.order;

import lombok.Data;

import java.math.BigDecimal;

/** One supplier-invoice line on a stock receive. */
@Data
public class ReceiveLineRequest {
    private Long productId;
    private String description;
    private BigDecimal caseQuantity;
    private BigDecimal quantity;
    private BigDecimal unitPrice;
}
