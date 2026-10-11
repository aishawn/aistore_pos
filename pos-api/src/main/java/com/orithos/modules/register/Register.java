package com.orithos.modules.register;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class Register {
    private Long id;
    private String name;
    private Long outletId;
    private String invoiceNumber;
    private LocalDateTime openTime;
    private Boolean closed;
    private String surcharging;
    private LocalDateTime deletedAt;
}
