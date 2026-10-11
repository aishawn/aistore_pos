package com.orithos.modules.bulkprice;

import lombok.Data;

@Data
public class BulkPriceEditQuery {
    private String search;
    private Long categoryId;
    private Boolean inStockOnly;
    private int page = 1;
    private int size = 10;

    public int getOffset() {
        return Math.max(0, (page - 1) * size);
    }
}
