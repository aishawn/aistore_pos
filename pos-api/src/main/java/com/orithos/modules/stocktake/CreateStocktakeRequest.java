package com.orithos.modules.stocktake;

import lombok.Data;

@Data
public class CreateStocktakeRequest {
    private String name;
    private Long outletId;
    private Boolean displayExpected;
    /** ADVANCED or EXPRESS; defaults to ADVANCED. */
    private String type;
}
