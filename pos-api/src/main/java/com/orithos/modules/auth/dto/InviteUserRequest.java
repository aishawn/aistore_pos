package com.orithos.modules.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record InviteUserRequest(
        @Size(max = 120) String name,
        @NotBlank @Size(max = 120) String username,
        @NotBlank @Email @Size(max = 255) String email,
        Long roleId,
        Boolean isAdmin,
        Long outletId) {}
