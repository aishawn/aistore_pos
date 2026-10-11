package com.orithos.modules.utility;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** Maps to table future_cost (mirrors future_price shape for cost). */
@Data
public class FutureCost {
    private Long id;
    private Long productId;
    private Long supplierId;
    private BigDecimal quantity;
    private BigDecimal cost;
    private BigDecimal costEx;
    private Long userId;
    private LocalDateTime effectiveTime;
}
