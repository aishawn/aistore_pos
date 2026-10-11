package com.orithos.modules.config;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class Setting {
    private Long id;
    private String scopeType;
    private Long scopeId;
    private String name;
    private String value;
    private String datatype;
    private LocalDateTime updatedAt;
}
