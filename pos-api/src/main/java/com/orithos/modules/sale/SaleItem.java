package com.orithos.modules.sale;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class SaleItem {
    private Long id;
    private Long saleId;
    private Long refundOfSaleItemId;
    private Long outletId;
    private Long productId;
    private BigDecimal quantity;
    private BigDecimal refundableQuantity;
    private BigDecimal refundableAmount;
    private BigDecimal refundableTax;
    private BigDecimal caseQuantity;
    private BigDecimal cost;
    private BigDecimal basePrice;
    private BigDecimal totalPrice;
    private BigDecimal savings;
    private BigDecimal tax;
    private Long taxRateId;
    private String discountAmount;
    private String discountReason;
    private String note;
}
