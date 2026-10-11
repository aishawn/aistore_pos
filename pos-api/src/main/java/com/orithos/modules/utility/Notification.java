package com.orithos.modules.utility;

import lombok.Data;

import java.time.LocalDateTime;

/** Maps to table notification. */
@Data
public class Notification {
    private Long id;
    private String notifiableType;
    private Long notifiableId;
    private String data;
    private LocalDateTime readAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
