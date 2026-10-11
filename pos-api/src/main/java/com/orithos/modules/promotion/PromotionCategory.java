package com.orithos.modules.promotion;

import lombok.Data;

@Data
public class PromotionCategory {
    private Long id;
    private String name;
    private Integer mdbId;
    private Boolean showOnOrder;
    private Boolean includeInIntegrations;
}
