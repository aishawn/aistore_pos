package com.orithos.modules.utility;

import lombok.Data;

import java.time.LocalDateTime;

/** Maps to table security_event. */
@Data
public class SecurityEvent {
    private Long id;
    private Long outletId;
    private Long registerId;
    private Long userId;
    private Long deviceId;
    private String event;
    private String metaData;
    private String ipv4;
    private String ipv6;
    private String userAgent;
    private LocalDateTime timestamp;
}
