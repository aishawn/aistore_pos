package com.orithos.modules.customer;

import lombok.Data;

import java.time.LocalDateTime;

/** Audit entry for customer create/update events. */
@Data
public class CustomerRevision {
    private Long id;
    private Long customerId;
    private Long userId;
    private String userName;
    private String action;
    private String fieldName;
    private String oldValue;
    private String newValue;
    private String summary;
    private LocalDateTime createdAt;
}
