package com.orithos.modules.register;

import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class Outlet {
    private Long id;
    private String name;
    private Long contactId;
    private String logo;
    private String businessNumber;
    private Boolean loyaltyEnabled;
    private String loyaltyName;
    private BigDecimal loyaltyEarnRate;
    private BigDecimal loyaltyRedeemRate;
    private Boolean hasKitchenScreen;
    private Long ticketingPriceSetId;
    private LocalDateTime createdAt;
    private LocalDateTime deletedAt;
}
