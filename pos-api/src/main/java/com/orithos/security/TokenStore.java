package com.orithos.security;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Date;

/**
 * Redis-backed token store: refresh-token whitelist + access-token denylist (logout).
 * Keys: jwt:refresh:<userId> and jwt:blacklist:<jti>.
 */
@Component
public class TokenStore {

    private final StringRedisTemplate redis;

    public TokenStore(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public void saveRefresh(Long userId, String jti, Date expiry) {
        redis.opsForValue().set("jwt:refresh:" + userId, jti, ttl(expiry));
    }

    public boolean refreshValid(Long userId, String jti) {
        return jti.equals(redis.opsForValue().get("jwt:refresh:" + userId));
    }

    public void revokeRefresh(Long userId) {
        redis.delete("jwt:refresh:" + userId);
    }

    public void blacklist(String jti, Date expiry) {
        redis.opsForValue().set("jwt:blacklist:" + jti, "1", ttl(expiry));
    }

    public boolean isBlacklisted(String jti) {
        return Boolean.TRUE.equals(redis.hasKey("jwt:blacklist:" + jti));
    }

    private Duration ttl(Date expiry) {
        long secs = Duration.between(Instant.now(), expiry.toInstant()).getSeconds();
        return Duration.ofSeconds(Math.max(secs, 1));
    }
}
