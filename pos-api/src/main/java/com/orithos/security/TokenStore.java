package com.orithos.security;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Date;

/**
 * Redis-backed token store: refresh-token whitelist + access-token denylist (logout).
 * Refresh rotation is keyed by user/session; access tokens use a JTI denylist.
 */
@Component
public class TokenStore {

    private final StringRedisTemplate redis;

    public TokenStore(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /** Keep the previous refresh id briefly so parallel tab refresh cannot revoke a still-valid cookie. */
    private static final Duration REFRESH_GRACE = Duration.ofMinutes(2);

    public void saveRefresh(Long userId, String jti, Date expiry) {
        String current = redis.opsForValue().get("jwt:refresh:" + userId);
        if (current != null && !current.equals(jti)) {
            redis.opsForValue().set("jwt:refresh:prev:" + userId, current, REFRESH_GRACE);
        }
        redis.opsForValue().set("jwt:refresh:" + userId, jti, ttl(expiry));
    }

    public long currentRefreshVersion(Long userId) {
        String value = redis.opsForValue().get(versionKey(userId));
        try { return value == null ? 0L : Long.parseLong(value); }
        catch (NumberFormatException ignored) { return 0L; }
    }

    public void saveRefresh(Long userId, String sessionId, String jti, Date expiry) {
        if (sessionId == null || sessionId.isBlank()) {
            saveRefresh(userId, jti, expiry);
            return;
        }
        String key = sessionKey(userId, sessionId);
        if (Boolean.TRUE.equals(redis.hasKey(revokedSessionKey(userId, sessionId)))) return;
        String previous = redis.opsForValue().get(key);
        if (previous != null && !previous.equals(jti)) {
            redis.opsForValue().set(previousKey(userId, sessionId), previous, REFRESH_GRACE);
        }
        redis.opsForValue().set(key, jti, ttl(expiry));
    }

    public boolean refreshValid(Long userId, String sessionId, String jti, Long tokenVersion) {
        try {
            long currentVersion = currentRefreshVersion(userId);
            if ((tokenVersion != null && tokenVersion != currentVersion)
                    || (tokenVersion == null && currentVersion > 0)) return false;
            if (sessionId == null || sessionId.isBlank()) return refreshValid(userId, jti);
            if (Boolean.TRUE.equals(redis.hasKey(revokedSessionKey(userId, sessionId)))) return false;
            String current = redis.opsForValue().get(sessionKey(userId, sessionId));
            if (jti.equals(current)) return true;
            String previous = redis.opsForValue().get(previousKey(userId, sessionId));
            if (jti.equals(previous)) return true;
            return false;
        } catch (Exception ignored) {
            return true;
        }
    }

    public void revokeRefreshSession(Long userId, String sessionId) {
        if (sessionId == null || sessionId.isBlank()) {
            revokeRefresh(userId);
            return;
        }
        redis.delete(sessionKey(userId, sessionId));
        redis.delete(previousKey(userId, sessionId));
        redis.opsForValue().set(revokedSessionKey(userId, sessionId), "1", Duration.ofDays(365));
    }

    public boolean isRefreshSessionRevoked(Long userId, String sessionId) {
        if (sessionId == null || sessionId.isBlank()) return false;
        try {
            return Boolean.TRUE.equals(redis.hasKey(revokedSessionKey(userId, sessionId)));
        } catch (Exception ignored) {
            return false;
        }
    }

    public boolean refreshValid(Long userId, String jti) {
        try {
            String current = redis.opsForValue().get("jwt:refresh:" + userId);
            if (jti.equals(current)) return true;
            String previous = redis.opsForValue().get("jwt:refresh:prev:" + userId);
            if (jti.equals(previous)) return true;
            // Redis evicted or cold start: trust a still-valid refresh JWT and re-whitelist on rotate.
            return current == null && previous == null;
        } catch (Exception ignored) {
            return true;
        }
    }

    public void revokeRefresh(Long userId) {
        redis.delete("jwt:refresh:" + userId);
        redis.delete("jwt:refresh:prev:" + userId);
        redis.opsForValue().increment(versionKey(userId));
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

    private static String sessionKey(Long userId, String sessionId) {
        return "jwt:refresh:" + userId + ":" + sessionId;
    }

    private static String previousKey(Long userId, String sessionId) {
        return "jwt:refresh:prev:" + userId + ":" + sessionId;
    }

    private static String versionKey(Long userId) {
        return "jwt:refresh:version:" + userId;
    }

    private static String revokedSessionKey(Long userId, String sessionId) {
        return "jwt:refresh:revoked:" + userId + ":" + sessionId;
    }
}
