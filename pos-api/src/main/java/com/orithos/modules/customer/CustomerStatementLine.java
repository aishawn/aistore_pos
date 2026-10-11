package com.orithos.modules.customer;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class CustomerStatementLine {
    private LocalDateTime occurredAt;
    private String description;
    private BigDecimal amount;
    /** CHARGE or PAYMENT */
    private String lineType;
}
