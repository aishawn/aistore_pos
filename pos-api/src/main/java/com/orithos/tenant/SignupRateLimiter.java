package com.orithos.tenant;

import com.orithos.common.BusinessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;

@Component
public class SignupRateLimiter {

    private final StringRedisTemplate redis;

    public SignupRateLimiter(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public void checkAvailable(String ip) {
        hit("avail", ip, 60, Duration.ofMinutes(1));
    }

    public void checkSignup(String ip) {
        hit("signup", ip, 5, Duration.ofHours(1));
    }

    private void hit(String bucket, String ip, int limit, Duration window) {
        String key = "tenant:rl:" + bucket + ":" + (ip == null || ip.isBlank() ? "unknown" : ip);
        Long count = redis.opsForValue().increment(key);
        if (count != null && count == 1L) {
            redis.expire(key, window);
        }
        if (count != null && count > limit) {
            throw new BusinessException(42900, "Too many requests. Please try again later.");
        }
    }
}
