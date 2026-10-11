package com.orithos.modules.stocktake;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class StocktakeProductSearchHit {
    private Long id;
    private String name;
    private BigDecimal price;
    private String barcode;
}
