package com.orithos.modules.order;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class InventoryMovement {
    private Long vendorId;
    private Long outletId;
    private Long productId;
    private BigDecimal quantityDelta;
    private Long sourceId;
    private Long sourceLineId;
    private String idempotencyKey;
    private Long actorId;
}
