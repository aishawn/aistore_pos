package com.orithos.modules.order;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class PurchaseReceipt {
    private Long id;
    private Long vendorId;
    private Long orderId;
    private Long outletId;
    private String idempotencyKey;
    private String requestHash;
    private Long receivedById;
    private String status;
    private LocalDateTime receivedAt;
}
