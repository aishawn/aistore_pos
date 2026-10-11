package com.orithos.modules.report;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class Report {
    private Long id;
    private String name;
    private String type;
    private String query;
    private Boolean special;
    private String emailSettings;
    private String filter;
    private Long ownerId;
    private LocalDateTime createdAt;
}
