package com.orithos.security;

import com.orithos.common.BusinessException;

/** Shared guard for store administration endpoints. */
public final class AdminAccess {
    private AdminAccess() {}

    public static void requireAdmin() {
        AuthUser current = CurrentUser.get();
        if (current == null) throw new BusinessException(40100, "Unauthorized");
        if (!current.admin()) throw new BusinessException(40300, "Administrator access required");
    }
}
