package com.orithos.modules.product;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class ProductInventory {
    private Long outletId;
    private String outletName;
    private BigDecimal quantity;
    private BigDecimal reorderLevel;
    private BigDecimal reorderAmount;
    private BigDecimal reorderLimit;
    private BigDecimal maxQuantity;
    private BigDecimal onOrder;
    /** NONE, CASE, ITEM */
    private String reorderRounding;
}
