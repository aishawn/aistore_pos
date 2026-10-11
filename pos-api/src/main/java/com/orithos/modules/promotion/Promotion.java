package com.orithos.modules.promotion;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class Promotion {
    private Long id;
    private String name;
    private Integer mdbId;
    private Long clientId;
    private Long promotionCategoryId;
    private LocalDateTime start;
    private LocalDateTime end;
    private Boolean express;
    private Boolean mixCriteria;
    private Boolean active;
    private Integer saleMaxApplicationCount;
    private List<PromotionCriteria> criteria;
}
