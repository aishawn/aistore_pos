package com.orithos.modules.stocktake;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class StocktakeProduct {
    private Long id;
    private Long stocktakeId;
    private Long productId;
    private BigDecimal cost;
    private BigDecimal caseQuantity;
    private Boolean scanned;
    private BigDecimal expectedCount;
    private BigDecimal expectedValue;
    private BigDecimal actualCount;
    private BigDecimal actualValue;
}
