package com.orithos.modules.webhook;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class Webhook {
    private Long id;
    private String name;
    private String url;
    private String events;
    private String signatureKey;
    private Long integrationId;
    private Boolean active;
    private LocalDateTime createdAt;
}
