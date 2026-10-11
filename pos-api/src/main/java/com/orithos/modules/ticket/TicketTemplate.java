package com.orithos.modules.ticket;

import lombok.Data;
import java.time.LocalDateTime;
import java.math.BigDecimal;

@Data
public class TicketTemplate {
    private Long id;
    private String name;
    private String styles;
    private String transformationScript;
    private BigDecimal width;
    private BigDecimal height;
    private String fonts;
    private String fieldsTracked;
    private String options;
    private LocalDateTime createdAt;
}
