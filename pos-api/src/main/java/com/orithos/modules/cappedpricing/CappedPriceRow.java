package com.orithos.modules.cappedpricing;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class CappedPriceRow {
    private Long id;
    private Long productId;
    private Long priceId;
    private String productName;
    private String priceSetName;
    private String source;
    private String sourceType;
    private LocalDate startDate;
    private LocalDate endDate;
    private BigDecimal quantity;
    private BigDecimal cappedPrice;
    private BigDecimal currentPrice;
    private BigDecimal cost;
}
