package com.orithos.modules.ai;

import com.orithos.common.BusinessException;
import com.orithos.modules.ai.report.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/** Shared provider quota for non-report AI endpoints, isolated by outlet. */
@Component
@EnableConfigurationProperties(AiProviderQuotaProperties.class)
public class AiProviderQuotaService {

    private static final Logger log = LoggerFactory.getLogger(AiProviderQuotaService.class);
    private static final DateTimeFormatter HOUR = DateTimeFormatter.ofPattern("yyyyMMddHH");
    private static final Duration TTL = Duration.ofHours(2);
    private static final int MAX_ESTIMATED_TOKENS = 100_000;

    private final AiProviderQuotaProperties properties;
    private final StringRedisTemplate redis;
    private final ConcurrentHashMap<String, AtomicLong> memory = new ConcurrentHashMap<>();

    public AiProviderQuotaService(AiProviderQuotaProperties properties, StringRedisTemplate redis) {
        this.properties = properties;
        this.redis = redis;
    }

    public void acquire(TenantContext tenant, int estimatedTokens) {
        if (tenant == null) throw new BusinessException(40100, "Unauthorized");
        Long outletId = tenant.requireOutletId();
        if (outletId == null || outletId <= 0) {
            throw new BusinessException(40901, "AI provider quota requires a store outlet.");
        }
        String hour = LocalDateTime.now(ZoneOffset.UTC).format(HOUR);
        String scope = tenant.vendorId() + ":" + outletId + ":" + hour;
        if (properties.getRequestsPerHour() > 0
                && increment("ai:provider:q:" + scope, 1) > properties.getRequestsPerHour()) {
            throw exceeded();
        }
        int tokens = Math.max(0, Math.min(MAX_ESTIMATED_TOKENS, estimatedTokens));
        if (properties.getTokensPerHour() > 0 && tokens > 0
                && increment("ai:provider:t:" + scope, tokens) > properties.getTokensPerHour()) {
            throw exceeded();
        }
    }

    public static int estimate(String... parts) {
        int chars = 0;
        for (String part : parts) if (part != null) chars += part.length();
        return Math.max(1, chars / 4);
    }

    private static BusinessException exceeded() {
        return new BusinessException(42901, "AI provider quota exceeded. Try again later.");
    }

    private long increment(String key, int delta) {
        try {
            if (redis == null) return memory.computeIfAbsent(key, ignored -> new AtomicLong()).addAndGet(delta);
            Long value = redis.opsForValue().increment(key, delta);
            if (value != null && value == delta) redis.expire(key, TTL);
            return value == null ? delta : value;
        } catch (Exception error) {
            log.warn("AI provider quota Redis unavailable, using process memory type={}",
                    error.getClass().getSimpleName());
            return memory.computeIfAbsent(key, ignored -> new AtomicLong()).addAndGet(delta);
        }
    }
}
