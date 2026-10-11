package com.orithos.modules.order;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class OrderProduct {
    private Long id;
    private Long orderId;
    private Long productId;
    private Long supplierId;
    private String supplierCode;
    private BigDecimal caseQuantity;
    private BigDecimal orderedQuantity;
    private BigDecimal receivedQuantity;
    private BigDecimal baseCost;
    private BigDecimal orderedCost;
    private BigDecimal fees;
    private BigDecimal freight;
    private BigDecimal rebate;
}
