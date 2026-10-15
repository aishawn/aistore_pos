package com.orithos.modules.auth.dto;

public record TokenResponse(
        String accessToken,
        String refreshToken,
        long expiresIn,
        UserInfo user,
        String redirectHost,
        String bootstrapToken) {

    public TokenResponse(String accessToken, String refreshToken, long expiresIn, UserInfo user) {
        this(accessToken, refreshToken, expiresIn, user, null, null);
    }

    public record UserInfo(Long id, String name, String username, boolean isAdmin, Long outletId,
                           Long vendorId, String email, boolean pendingPasswordReset,
                           boolean platformOperator) {}
}
