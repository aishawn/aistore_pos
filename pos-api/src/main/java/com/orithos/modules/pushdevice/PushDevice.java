package com.orithos.modules.pushdevice;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class PushDevice {
    private Long id;
    private String name;
    private String endpoint;
    private String notifications;
    private LocalDateTime createdAt;
}
