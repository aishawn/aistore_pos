package com.orithos.modules.sell.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.List;

@Data
public class SellSearchResponse {
    private List<ProductHit> products;
    private List<CustomerHit> customers;

    @Data
    public static class ProductHit {
        private Long id;
        private String name;
        private BigDecimal price;
        private BigDecimal caseQuantity;
    }

    @Data
    public static class CustomerHit {
        private Long id;
        private String name;
        private String groupName;
        private BigDecimal loyaltyPoints;
    }
}
