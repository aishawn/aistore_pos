package com.orithos.modules.auth.dto;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
        @NotBlank String username,
        @NotBlank String password,
        /**
         * Unused on store hosts (tenant comes from Host).
         * Optional on the control plane for backward compatibility; when omitted,
         * login uses the platform-operator vendor.
         */
        String subdomain) {}
