package com.orithos.modules.ai.gateway;

import com.orithos.common.BusinessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;

/** Distributed, fail-closed budget reservation for provider calls. */
@Service
public class AiGatewayQuotaService {
    private static final DefaultRedisScript<Long> RESERVE = new DefaultRedisScript<>("""
            local requestLimit = tonumber(ARGV[1])
            local tokenLimit = tonumber(ARGV[2])
            local tokens = tonumber(ARGV[3])
            for i = 1, 3 do
              if tonumber(redis.call('GET', KEYS[i]) or '0') + 1 > requestLimit then return 0 end
            end
            for i = 4, 6 do
              if tonumber(redis.call('GET', KEYS[i]) or '0') + tokens > tokenLimit then return 0 end
            end
            for i = 1, 3 do
              redis.call('INCRBY', KEYS[i], 1)
              redis.call('EXPIRE', KEYS[i], tonumber(ARGV[4]))
            end
            for i = 4, 6 do
              redis.call('INCRBY', KEYS[i], tokens)
              redis.call('EXPIRE', KEYS[i], tonumber(ARGV[5]))
            end
            return 1
            """, Long.class);

    private final StringRedisTemplate redis;
    private final AiGatewayProperties properties;

    public AiGatewayQuotaService(StringRedisTemplate redis, AiGatewayProperties properties) {
        this.redis = redis;
        this.properties = properties;
    }

    public void reserve(AiTenantContext tenant, int estimatedTokens) {
        Instant now = Instant.now();
        String minute = now.truncatedTo(ChronoUnit.MINUTES).toString();
        String hour = now.atZone(ZoneOffset.UTC).truncatedTo(ChronoUnit.HOURS).toInstant().toString();
        List<String> keys = List.of(
                key("req", "vendor", tenant.vendorId(), minute),
                key("req", "outlet", tenant.outletId(), minute),
                key("req", "user", tenant.userId(), minute),
                key("token", "vendor", tenant.vendorId(), hour),
                key("token", "outlet", tenant.outletId(), hour),
                key("token", "user", tenant.userId(), hour));
        int reservation = Math.max(1, estimatedTokens);
        Long allowed;
        try {
            allowed = redis.execute(RESERVE, keys,
                    Integer.toString(properties.getRequestsPerMinute()),
                    Integer.toString(properties.getTokensPerHour()),
                    Integer.toString(reservation), "120", "7200");
        } catch (RuntimeException unavailable) {
            throw new BusinessException(50320, "AI quota service is unavailable");
        }
        if (allowed == null) throw new BusinessException(50320, "AI quota service is unavailable");
        if (allowed != 1L) throw new BusinessException(42901, "AI usage limit reached");
    }

    static int estimateTokens(String... parts) {
        long characters = 0;
        for (String part : parts) if (part != null) characters += part.length();
        return (int) Math.min(Integer.MAX_VALUE, Math.max(1, (characters + 3) / 4 + 1024));
    }

    static int estimateMediaTokens(byte[] media, String prompt) {
        long mediaEstimate = media == null ? 0 : Math.min(100_000L, (media.length + 3L) / 4L);
        return (int) Math.min(Integer.MAX_VALUE,
                Math.max(1, mediaEstimate + ((prompt == null ? 0 : prompt.length()) + 3L) / 4L + 1024));
    }

    private static String key(String kind, String scope, long id, String bucket) {
        return "ai:gateway:" + kind + ":" + scope + ":" + id + ":" + bucket;
    }
}
