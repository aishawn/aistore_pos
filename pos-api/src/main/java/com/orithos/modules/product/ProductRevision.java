package com.orithos.modules.product;

import lombok.Data;

import java.time.LocalDateTime;

/** Audit entry for product create/update/delete events. */
@Data
public class ProductRevision {
    private Long id;
    private Long productId;
    private Long userId;
    private String userName;
    private String action;
    private String fieldName;
    private String oldValue;
    private String newValue;
    private String summary;
    private LocalDateTime createdAt;
}
