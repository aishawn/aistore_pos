package com.orithos.security;

import org.springframework.security.core.context.SecurityContextHolder;

/** Convenience accessor for the current authenticated principal. */
public final class CurrentUser {
    private CurrentUser() {}

    public static AuthUser get() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof AuthUser u) {
            return u;
        }
        return null;
    }

    public static Long id() {
        AuthUser u = get();
        return u == null ? null : u.id();
    }

    /** Store / outlet id. */
    public static Long outletId() {
        AuthUser u = get();
        return u == null ? null : u.outletId();
    }

    /** SaaS vendor id (subdomain tenant). */
    public static Long vendorId() {
        AuthUser u = get();
        return u == null ? null : u.vendorId();
    }

    public static String sessionId() {
        AuthUser u = get();
        return u == null ? null : u.sessionId();
    }
}
