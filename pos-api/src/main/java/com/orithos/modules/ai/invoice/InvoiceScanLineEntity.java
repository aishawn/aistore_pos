package com.orithos.modules.ai.invoice;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class InvoiceScanLineEntity {
    private Long id;
    private Long sessionId;
    private int lineIndex;
    private String description;
    private String brand;
    private BigDecimal packQty;
    private BigDecimal qtyCases;
    private BigDecimal unitPrice;
    private BigDecimal lineTotal;
    private Long productId;
    private String productName;
    private String matchStatus;
    private BigDecimal confidence;
}
