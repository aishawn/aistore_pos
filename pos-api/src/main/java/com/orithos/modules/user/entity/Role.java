package com.orithos.modules.user.entity;

import lombok.Data;

/** Maps to table role. */
@Data
public class Role {
    private Long id;
    private String name;
    private Long managedId;
}
