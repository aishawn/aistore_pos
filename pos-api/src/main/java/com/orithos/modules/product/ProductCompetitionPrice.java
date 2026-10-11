package com.orithos.modules.product;

import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class ProductCompetitionPrice {
    private Long id;
    private Long productId;
    private String competitor;
    private BigDecimal price;
    private LocalDateTime createdAt;
}
