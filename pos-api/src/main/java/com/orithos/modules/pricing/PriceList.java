package com.orithos.modules.pricing;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class PriceList {
    private Long outletId;
    private Long id;
    private String name;
    private Boolean active;
    private Boolean allowHigherPrice;
    private Boolean allowDiscountingPromotions;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private List<PriceListItem> items;
}
