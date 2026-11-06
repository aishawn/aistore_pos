package com.orithos.posapi;

import java.time.LocalDateTime;
import java.util.Set;

public record PosApiToken(long id, long vendorId, String name, Set<String> scopes,
                          LocalDateTime expiresAt, LocalDateTime revokedAt) {
    public boolean usable() { return revokedAt == null && (expiresAt == null || expiresAt.isAfter(LocalDateTime.now())); }
    public boolean allows(String scope) { return scopes.contains(scope) || scopes.contains("api.admin"); }
}
