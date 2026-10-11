package com.orithos.modules.stocktake;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class Stocktake {
    private Long id;
    private String name;
    private String type;
    private Long outletId;
    private String status;
    private Boolean displayExpected;
    private Boolean applied;
    private Long completedById;
    private LocalDateTime createdAt;
    private LocalDateTime completedAt;
    private List<StocktakeProduct> products;
}
