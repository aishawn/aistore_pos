package com.orithos.modules.ai.sommelier;

import com.orithos.modules.ai.report.TenantContext;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

public final class WineTenantContextToken {
    private WineTenantContextToken() {}

    public static String sign(TenantContext tenant, Set<String> scopes, String secret) {
        return sign(tenant, scopes, secret, Instant.now());
    }

    static String sign(TenantContext tenant, Set<String> scopes, String secret, Instant now) {
        if (tenant == null || tenant.vendorId() <= 0 || tenant.userId() <= 0 || tenant.requireOutletId() == null
                || tenant.requireOutletId() <= 0) {
            throw new IllegalArgumentException("authenticated tenant and outlet are required");
        }
        if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalArgumentException("wine knowledge HMAC secret must be at least 32 bytes");
        }
        if (scopes == null || scopes.isEmpty()) throw new IllegalArgumentException("scope is required");
        return Jwts.builder()
                .issuer("orithos-pos")
                .subject(Long.toString(tenant.userId()))
                .audience().add("orithos-ai").and()
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(60)))
                .claim("vendor_id", tenant.vendorId())
                .claim("outlet_id", tenant.requireOutletId())
                .claim("scope", List.copyOf(new TreeSet<>(scopes)))
                .signWith(Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8)))
                .compact();
    }
}
