package com.orithos.modules.salekeys;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class SaleKeys {
    private Long id;
    private String name;
    private String saleKeys;
    private LocalDateTime createdAt;
}
