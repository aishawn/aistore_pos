package com.orithos.modules.auth.dto;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
        @NotBlank String username,
        @NotBlank String password,
        /** Required on control-plane hosts (app.orithos.com.au / localhost). */
        String subdomain) {}
