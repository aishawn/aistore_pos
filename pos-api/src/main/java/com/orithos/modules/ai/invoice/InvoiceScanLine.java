package com.orithos.modules.ai.invoice;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class InvoiceScanLine {
    private Long productId;
    private String description;
    private String brand;
    private BigDecimal packQty;
    private BigDecimal qtyCases;
    private BigDecimal unitPrice;
    private BigDecimal lineTotal;
    private boolean createProduct;
}
