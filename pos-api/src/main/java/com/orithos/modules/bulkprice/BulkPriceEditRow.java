package com.orithos.modules.bulkprice;

import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Data
public class BulkPriceEditRow {
    private Long productId;
    private String productName;
    private BigDecimal caseQuantity;
    private String priceSetName;
    private List<BulkPriceBreak> prices = new ArrayList<>();

    @Data
    public static class BulkPriceBreak {
        private Long priceId;
        private BigDecimal quantity;
        private BigDecimal price;
    }
}
