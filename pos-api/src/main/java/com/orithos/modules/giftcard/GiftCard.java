package com.orithos.modules.giftcard;

import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class GiftCard {
    private Long id;
    private Long clientId;
    private Long outletId;
    private String code;
    private BigDecimal originalAmount;
    private BigDecimal currentAmount;
    private LocalDateTime expiry;
    private String status;
}
