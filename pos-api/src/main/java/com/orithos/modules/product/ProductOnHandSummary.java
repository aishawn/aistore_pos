package com.orithos.modules.product;

import lombok.Data;

import java.math.BigDecimal;

/** Full-catalog Inventory On Hand footer totals (not page-window sums). */
@Data
public class ProductOnHandSummary {
    private long productCount;
    private BigDecimal caseLevelTotal;
    private BigDecimal itemLevelTotal;
    private BigDecimal valueIncLastTotal;
}
