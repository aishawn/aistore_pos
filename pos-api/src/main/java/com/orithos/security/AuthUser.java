package com.orithos.security;

/** Authenticated principal stored in the SecurityContext. */
public record AuthUser(Long id, String username, boolean admin, Long outletId, Long vendorId) {}
