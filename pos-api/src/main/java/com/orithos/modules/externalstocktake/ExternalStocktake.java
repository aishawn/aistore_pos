package com.orithos.modules.externalstocktake;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class ExternalStocktake {
    private Long id;
    private Long outletId;
    private Long userId;
    private Long completedId;
    private Boolean zeroStock;
    private Boolean overrideStock;
    private String status;
    private LocalDateTime timestamp;
    /** Joined from outlet.name for list display. */
    private String outletName;
}
