package com.orithos.security;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.UUID;

/**
 * One-time tokens for password reset and staff invites.
 * Keys: auth:token:&lt;token&gt; → userId|purpose, auth:user:&lt;purpose&gt;:&lt;userId&gt; → token.
 */
@Component
public class AccountTokenStore {

    public static final String PURPOSE_RESET = "reset";
    public static final String PURPOSE_INVITE = "invite";
    /** One-time cross-subdomain login handoff after signup. */
    public static final String PURPOSE_BOOTSTRAP = "bootstrap";

    private final StringRedisTemplate redis;

    public AccountTokenStore(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public String issue(Long userId, String purpose, Duration ttl) {
        revokeForUser(userId, purpose);
        String token = UUID.randomUUID().toString().replace("-", "")
                + UUID.randomUUID().toString().replace("-", "");
        redis.opsForValue().set(tokenKey(token), userId + "|" + purpose, ttl);
        redis.opsForValue().set(userKey(userId, purpose), token, ttl);
        return token;
    }

    /** @return userId when valid for the expected purpose; otherwise null */
    public Long consume(String token, String expectedPurpose) {
        String raw = redis.opsForValue().get(tokenKey(token));
        if (raw == null) return null;
        String[] parts = raw.split("\\|", 2);
        if (parts.length != 2 || !expectedPurpose.equals(parts[1])) return null;
        Long userId;
        try {
            userId = Long.parseLong(parts[0]);
        } catch (NumberFormatException e) {
            return null;
        }
        redis.delete(tokenKey(token));
        redis.delete(userKey(userId, expectedPurpose));
        return userId;
    }

    public Long peek(String token, String expectedPurpose) {
        String raw = redis.opsForValue().get(tokenKey(token));
        if (raw == null) return null;
        String[] parts = raw.split("\\|", 2);
        if (parts.length != 2 || !expectedPurpose.equals(parts[1])) return null;
        try {
            return Long.parseLong(parts[0]);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    public void revokeForUser(Long userId, String purpose) {
        String existing = redis.opsForValue().get(userKey(userId, purpose));
        if (existing != null) {
            redis.delete(tokenKey(existing));
            redis.delete(userKey(userId, purpose));
        }
    }

    private static String tokenKey(String token) {
        return "auth:token:" + token;
    }

    private static String userKey(Long userId, String purpose) {
        return "auth:user:" + purpose + ":" + userId;
    }
}
