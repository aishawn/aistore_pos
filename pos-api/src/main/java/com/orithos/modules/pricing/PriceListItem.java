package com.orithos.modules.pricing;

import lombok.Data;
import com.fasterxml.jackson.annotation.JsonIgnore;
import java.math.BigDecimal;

@Data
public class PriceListItem {
    @JsonIgnore
    private Long outletId;
    private Long id;
    private Long priceListId;
    private String classificationType;
    private Long itemId;
    private Boolean exclude;
    private String rule;
    private BigDecimal amount;
}
