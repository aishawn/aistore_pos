package com.orithos.modules.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ResetPasswordRequest(
        @NotBlank @Size(max = 128) String token,
        @NotBlank @Size(min = 12, max = 72) String newPassword,
        /** "reset" (default) or "invite" */
        String purpose) {}
