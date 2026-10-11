package com.orithos.modules.tax;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class TaxRate {
    private Long id;
    private String name;
    private BigDecimal amount;
    private Integer mdbId;
    private Boolean isDefault;
}
