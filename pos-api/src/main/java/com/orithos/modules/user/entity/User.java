package com.orithos.modules.user.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Data;
import java.time.LocalDateTime;

/** Maps to table app_user. */
@Data
public class User {
    private Long id;
    private String name;
    private String username;
    @JsonIgnore
    private String passwordHash;
    private String email;
    private String phone;
    private String image;
    private Long roleId;
    private Boolean isAdmin;
    private Boolean isApiUser;
    private String darkMode;
    private String dashboard;
    private Boolean pendingPasswordReset;
    private Long outletId;
    private LocalDateTime deletedAt;
    private LocalDateTime createdAt;
}
