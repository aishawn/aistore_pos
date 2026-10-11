package com.orithos.modules.customer;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** Flattened sale line item for the customer detail "Last 10 Sales" table. */
@Data
public class CustomerRecentSaleLine {
    private LocalDateTime timestamp;
    private String userName;
    private BigDecimal quantity;
    private String item;
    private BigDecimal price;
}
