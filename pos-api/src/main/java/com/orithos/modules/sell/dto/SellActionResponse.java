package com.orithos.modules.sell.dto;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class SellActionResponse {
    private String action;
    private String message;
    /** For CASE_QUANTITY — how many units to add for the selected product. */
    private BigDecimal caseQuantity;
    private boolean success;
}
