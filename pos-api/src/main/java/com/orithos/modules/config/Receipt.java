package com.orithos.modules.config;

import lombok.Data;

@Data
public class Receipt {
    private Long id;
    private String name;
    private String type;
    private String components;
    private Integer receiptWidth;
    private Boolean accountReceipt;
}
