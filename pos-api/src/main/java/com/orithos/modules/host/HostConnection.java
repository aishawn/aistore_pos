package com.orithos.modules.host;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class HostConnection {
    private Long id;
    private String type;
    private Long outletId;
    private Long priceSetId;
    private Long userId;
    private String metadata;
    private String settings;
    private String credentials;
    private LocalDateTime createdAt;
}
