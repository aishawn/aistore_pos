package com.orithos.modules.stocklist;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class StockListRow {
    private Long id;
    private String name;
    private String categoryName;
    private String priceSetName;
    private BigDecimal caseQuantity;
    private BigDecimal casesOnHand;
    private BigDecimal itemsOnHand;
    private BigDecimal priceQuantity;
    private Long priceId;
    private BigDecimal cost;
    private BigDecimal price;
}
