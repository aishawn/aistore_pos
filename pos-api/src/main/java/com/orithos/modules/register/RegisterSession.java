package com.orithos.modules.register;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class RegisterSession {
    private Long id;
    private Long vendorId;
    private Long outletId;
    private Long registerId;
    private Long openedBy;
    private LocalDateTime openedAt;
    private BigDecimal openingFloat;
    private String openIdempotencyKey;
    private LocalDateTime closedAt;
    private Long closureId;
    private String closeIdempotencyKey;
    private String closeRequestHash;
}
