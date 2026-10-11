package com.orithos.modules.giftcard;

import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class GiftCardMovement {
    private Long id;
    private Long giftCardId;
    private Long saleId;
    private Long registerId;
    private BigDecimal amount;
    private String action;
    private LocalDateTime timestamp;
    private String giftCardCode;
}
