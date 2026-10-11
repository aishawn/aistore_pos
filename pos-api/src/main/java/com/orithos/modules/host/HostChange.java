package com.orithos.modules.host;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class HostChange {
    private Long id;
    private Long hostConnectionId;
    private String type;
    private String status;
    private String data;
    private LocalDateTime createdAt;
}
