package com.orithos.modules.product;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class ProductPrice {
    private Long id;
    private Long productId;
    private BigDecimal quantity;
    private BigDecimal price;
}
