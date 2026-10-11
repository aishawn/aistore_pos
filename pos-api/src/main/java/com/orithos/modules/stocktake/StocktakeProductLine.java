package com.orithos.modules.stocktake;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class StocktakeProductLine {
    private Long id;
    private Long productId;
    private String productName;
    private BigDecimal cost;
    private BigDecimal price;
    private BigDecimal caseQuantity;
    private Boolean scanned;
    private BigDecimal expectedCount;
    private BigDecimal expectedValue;
    private BigDecimal actualCount;
    private BigDecimal actualValue;
}
