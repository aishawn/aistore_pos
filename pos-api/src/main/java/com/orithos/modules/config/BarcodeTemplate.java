package com.orithos.modules.config;

import lombok.Data;

@Data
public class BarcodeTemplate {
    private Long id;
    private String name;
    private String template;
    private Boolean recalculateQuantity;
}
