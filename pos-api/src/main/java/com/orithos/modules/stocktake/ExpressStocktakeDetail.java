package com.orithos.modules.stocktake;

import lombok.Data;

import java.util.List;

@Data
public class ExpressStocktakeDetail {
    private Long id;
    private String name;
    private Long outletId;
    private String outletName;
    private String status;
    private String type;
    private Boolean displayExpected;
    private List<StocktakeProductLine> products;
}
