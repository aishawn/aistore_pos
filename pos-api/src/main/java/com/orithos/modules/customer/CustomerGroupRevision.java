package com.orithos.modules.customer;

import lombok.Data;

import java.time.LocalDateTime;

/** Audit entry for customer group create/update events. */
@Data
public class CustomerGroupRevision {
    private Long id;
    private Long customerGroupId;
    private Long userId;
    private String userName;
    private String action;
    private String fieldName;
    private String oldValue;
    private String newValue;
    private String summary;
    private LocalDateTime createdAt;
}
