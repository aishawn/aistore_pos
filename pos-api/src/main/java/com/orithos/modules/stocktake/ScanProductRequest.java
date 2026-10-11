package com.orithos.modules.stocktake;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class ScanProductRequest {
    /** Product name or barcode text from the search field. */
    private String query;
    /** When the user picks from search results. */
    private Long productId;
}
