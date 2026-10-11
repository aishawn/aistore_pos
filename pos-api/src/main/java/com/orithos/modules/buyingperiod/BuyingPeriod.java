package com.orithos.modules.buyingperiod;

import lombok.Data;
import java.time.LocalDateTime;
import java.math.BigDecimal;

@Data
public class BuyingPeriod {
    private Long id;
    private Long itemId;
    private String itemType;
    private Long outletId;
    private Long supplierId;
    private LocalDateTime start;
    private LocalDateTime end;
    private BigDecimal quantity;
    private BigDecimal cost;
}
