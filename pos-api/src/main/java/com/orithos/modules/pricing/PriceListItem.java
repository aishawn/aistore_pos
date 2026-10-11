package com.orithos.modules.pricing;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class PriceListItem {
    private Long id;
    private Long priceListId;
    private String classificationType;
    private Long itemId;
    private Boolean exclude;
    private String rule;
    private BigDecimal amount;
}
