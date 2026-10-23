package com.orithos.modules.user.entity;

import lombok.Data;

/** Maps to table role. managed_id is ADMIN|MANAGER|CLERK for fixed store roles. */
@Data
public class Role {
    private Long id;
    private String name;
    /** Fixed role code when managed; null for legacy custom roles. */
    private String managedId;
}
