package com.orithos.modules.ai.report;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Per-outlet hourly caps for report questions and estimated tokens. Global model key.
 */
@Component
public class AiReportQuotaService {

    private static final Logger log = LoggerFactory.getLogger(AiReportQuotaService.class);
    private static final DateTimeFormatter HOUR = DateTimeFormatter.ofPattern("yyyyMMddHH");
    private static final Duration TTL = Duration.ofHours(2);

    private final AiReportProperties props;
    private final StringRedisTemplate redis;
    private final ConcurrentHashMap<String, AtomicLong> memory = new ConcurrentHashMap<>();

    public AiReportQuotaService(AiReportProperties props, StringRedisTemplate redis) {
        this.props = props;
        this.redis = redis;
    }

    public void acquire(long outletId, int queries, int tokens) {
        AiReportTenantSchema.requireOutletId(outletId);
        String hour = LocalDateTime.now(ZoneOffset.UTC).format(HOUR);
        if (props.getQueriesPerHour() > 0 && queries > 0) {
            long n = increment("ai:rpt:q:" + outletId + ":" + hour, queries);
            if (n > props.getQueriesPerHour()) {
                throw new SqlGuardException("QUOTA_EXCEEDED");
            }
        }
        if (props.getTokensPerHour() > 0 && tokens > 0) {
            long n = increment("ai:rpt:t:" + outletId + ":" + hour, tokens);
            if (n > props.getTokensPerHour()) {
                throw new SqlGuardException("QUOTA_EXCEEDED");
            }
        }
    }

    static int estimateTokens(String... parts) {
        int chars = 0;
        for (String p : parts) {
            if (p != null) {
                chars += p.length();
            }
        }
        return Math.max(1, chars / 4);
    }

    private long increment(String key, int delta) {
        try {
            if (redis == null) {
                return memory.computeIfAbsent(key, k -> new AtomicLong()).addAndGet(delta);
            }
            Long n = redis.opsForValue().increment(key, delta);
            if (n != null && n == (long) delta) {
                redis.expire(key, TTL);
            }
            return n == null ? delta : n;
        } catch (Exception e) {
            log.warn("AI report quota Redis unavailable, using process memory: {}", e.getMessage());
            return memory.computeIfAbsent(key, k -> new AtomicLong()).addAndGet(delta);
        }
    }
}
