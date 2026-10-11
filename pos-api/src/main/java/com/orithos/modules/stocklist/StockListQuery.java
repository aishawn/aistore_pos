package com.orithos.modules.stocklist;

import lombok.Data;

@Data
public class StockListQuery {
    /** Matches product name or category name. */
    private String search;
    private Long categoryId;
    private Boolean inStockOnly;
    private int page = 1;
    private int size = 10;

    public int getOffset() {
        return Math.max(0, (page - 1) * size);
    }
}
