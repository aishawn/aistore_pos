package com.orithos.modules.user.entity;

import lombok.Data;

/** Maps to table permission. */
@Data
public class Permission {
    private Integer id;
    private String name;
    private String safeName;
    private String section;
}
