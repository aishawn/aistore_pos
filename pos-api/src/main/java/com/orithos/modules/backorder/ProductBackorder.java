package com.orithos.modules.backorder;

import lombok.Data;
import java.time.LocalDateTime;
import java.math.BigDecimal;

@Data
public class ProductBackorder {
    private Long id;
    private Long productId;
    private Long customerId;
    private Long outletId;
    private Long onOrderId;
    private BigDecimal quantity;
    private String recurringPeriod;
    private LocalDateTime nextDueDate;
    private String notes;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
