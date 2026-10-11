package com.orithos.modules.integration;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class Integration {
    private Long id;
    private String name;
    private String type;
    private Boolean enabled;
    private String config;
    private LocalDateTime createdAt;
}
