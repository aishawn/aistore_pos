package com.orithos.modules.vendor;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class Vendor {
    private Long id;
    private String name;
    private String subdomain;
    private String status;
    private String url;
    private String businessType;
    private String contactName;
    private Long defaultTaxRateId;
    private LocalDateTime trialEndsAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private Long outletId;
}
