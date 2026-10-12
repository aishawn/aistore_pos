package com.orithos.modules.auth.dto;

public record TokenResponse(
        String accessToken,
        String refreshToken,
        long expiresIn,
        UserInfo user) {

    public record UserInfo(Long id, String name, String username, boolean isAdmin, Long outletId,
                           String email, boolean pendingPasswordReset) {}
}
