package com.orithos.modules.register;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class RegisterCashMovement {
    private Long id;
    private Long sessionId;
    private Long vendorId;
    private Long outletId;
    private Long registerId;
    private Long userId;
    private String movementType;
    private BigDecimal amount;
    private String reason;
    private String idempotencyKey;
    private LocalDateTime createdAt;
}
