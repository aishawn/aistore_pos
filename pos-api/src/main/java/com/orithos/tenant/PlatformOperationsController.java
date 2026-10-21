package com.orithos.tenant;

import com.orithos.common.ApiResult;
import com.orithos.common.BuildIdentityController;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/operations")
public class PlatformOperationsController {

    private static final Logger log = LoggerFactory.getLogger(PlatformOperationsController.class);

    private final PlatformAccessService platformAccess;
    private final JdbcTemplate jdbcTemplate;
    private final StringRedisTemplate redisTemplate;
    private final BuildIdentityController buildIdentity;
    private final boolean aiEnabled;
    private final String aiApiKey;
    private final String odooBaseUrl;
    private final String environment;

    public PlatformOperationsController(
            PlatformAccessService platformAccess,
            JdbcTemplate jdbcTemplate,
            StringRedisTemplate redisTemplate,
            BuildIdentityController buildIdentity,
            @Value("${app.ai.enabled:false}") boolean aiEnabled,
            @Value("${AI_DASHSCOPE_API_KEY:}") String aiApiKey,
            @Value("${ODOO_BASE_URL:}") String odooBaseUrl,
            @Value("${RUNTIME_ENVIRONMENT:unknown}") String environment) {
        this.platformAccess = platformAccess;
        this.jdbcTemplate = jdbcTemplate;
        this.redisTemplate = redisTemplate;
        this.buildIdentity = buildIdentity;
        this.aiEnabled = aiEnabled;
        this.aiApiKey = aiApiKey;
        this.odooBaseUrl = odooBaseUrl;
        this.environment = environment;
    }

    @GetMapping("/health")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Map<String, Object>> health() {
        platformAccess.requirePlatformAdmin();
        Instant checkedAt = Instant.now();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("environment", environment == null || environment.isBlank() ? "unknown" : environment);
        result.put("checkedAt", checkedAt.toString());
        result.put("backend", buildIdentity.version().getBody());
        result.put("dependencies", List.of(
                probeDatabase(),
                probeRedis(),
                odooConfiguration(),
                aiConfiguration()));
        return ApiResult.ok(result);
    }

    private Map<String, Object> probeDatabase() {
        long started = System.nanoTime();
        try {
            Integer result = jdbcTemplate.queryForObject("SELECT 1", Integer.class);
            if (!Integer.valueOf(1).equals(result)) throw new IllegalStateException("Database probe returned an unexpected value");
            return dependency("database", "UP", elapsedMillis(started), "Connection probe succeeded.");
        } catch (Exception error) {
            log.warn("Platform health database probe failed type={}", error.getClass().getSimpleName());
            return dependency("database", "DOWN", elapsedMillis(started), "Connection probe failed.");
        }
    }

    private Map<String, Object> probeRedis() {
        long started = System.nanoTime();
        try {
            String response = redisTemplate.execute((RedisCallback<String>) connection -> connection.ping());
            if (!"PONG".equalsIgnoreCase(response)) throw new IllegalStateException("Redis probe returned an unexpected response");
            return dependency("redis", "UP", elapsedMillis(started), "Connection probe succeeded.");
        } catch (Exception error) {
            log.warn("Platform health Redis probe failed type={}", error.getClass().getSimpleName());
            return dependency("redis", "DOWN", elapsedMillis(started), "Connection probe failed.");
        }
    }

    private Map<String, Object> odooConfiguration() {
        boolean configured = odooBaseUrl != null && !odooBaseUrl.isBlank();
        return dependency("odoo", configured ? "CONFIGURED_UNVERIFIED" : "NOT_CONFIGURED",
                null, "This page does not probe Odoo connectivity.");
    }

    private Map<String, Object> aiConfiguration() {
        String status = !aiEnabled ? "DISABLED"
                : aiApiKey == null || aiApiKey.isBlank() ? "MISCONFIGURED" : "CONFIGURED_UNVERIFIED";
        String note = !aiEnabled ? "AI is disabled; this is not an availability failure."
                : "Provider connectivity is not probed to avoid billable requests.";
        return dependency("ai", status, null, note);
    }

    private static Map<String, Object> dependency(String name, String status, Long durationMs, String note) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("name", name);
        result.put("status", status);
        result.put("durationMs", durationMs);
        result.put("note", note);
        return result;
    }

    private static long elapsedMillis(long started) {
        return (System.nanoTime() - started) / 1_000_000;
    }
}
