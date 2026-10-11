package com.orithos.modules.utility;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** Maps to table future_price. */
@Data
public class FuturePrice {
    private Long id;
    private Long productId;
    private Long priceSetId;
    private BigDecimal quantity;
    private BigDecimal price;
    private BigDecimal priceEx;
    private Long userId;
    private LocalDateTime effectiveTime;
}
