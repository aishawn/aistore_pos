package com.orithos.tenant;

import com.orithos.common.BuildIdentityController;
import com.orithos.config.CorrelationIdContext;
import com.orithos.config.RequestCorrelationFilter;
import com.orithos.security.AuthUser;
import com.orithos.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@Service
public class PlatformFailureEventService {

    private static final Logger log = LoggerFactory.getLogger(PlatformFailureEventService.class);
    private static final Pattern BEARER_TOKEN = Pattern.compile("(?i)(Bearer\\s+)[A-Za-z0-9._~+/-]+=*");
    private static final Pattern SECRET_ASSIGNMENT = Pattern.compile(
            "(?i)([\\\"']?(?:password|token|secret|api[_-]?key|authorization)[\\\"']?\\s*[:=]\\s*[\\\"']?)[^\\s\\\"',;}]+");
    private static final Pattern EMAIL = Pattern.compile("(?i)\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b");
    private static final Pattern PHONE = Pattern.compile("(?<!\\d)(?:\\+?61|0)[2-478](?:[ -]?\\d){8}(?!\\d)");
    private static final Pattern SENSITIVE_PATH_SEGMENT = Pattern.compile(
            "(?i)(/(?:reset(?:-password)?|password-reset|bootstrap|invite|token)/)[^/]+");

    private final PlatformFailureEventMapper mapper;
    private final PlatformAlertService alerts;
    private final BuildIdentityController buildIdentity;
    private final String environment;

    @Autowired
    public PlatformFailureEventService(PlatformFailureEventMapper mapper,
                                       BuildIdentityController buildIdentity,
                                       PlatformAlertService alerts,
                                       @Value("${RUNTIME_ENVIRONMENT:unknown}") String environment) {
        this.mapper = mapper;
        this.buildIdentity = buildIdentity;
        this.alerts = alerts;
        this.environment = environment;
    }

    /** Compatibility constructor for focused failure-capture tests that do not exercise alerts. */
    public PlatformFailureEventService(PlatformFailureEventMapper mapper,
                                       BuildIdentityController buildIdentity,
                                       String environment) {
        this(mapper, buildIdentity, null, environment);
    }

    @Transactional
    public void record(HttpServletRequest request, int httpStatus, Integer errorCode, Throwable error) {
        try {
            TenantHolder.ResolvedTenant resolved = TenantHolder.get();
            var tenant = resolved == null ? null : resolved.vendor();
            AuthUser actor = CurrentUser.get();
            String method = bounded(request.getMethod(), 12);
            String path = bounded(safePath(request.getRequestURI()), 255);
            String errorType = bounded(error.getClass().getSimpleName(), 120);
            String runtimeCommit = runtimeCommit();
            String fingerprint = fingerprint(environment, runtimeCommit, tenant == null ? null : tenant.getId(),
                    method, path, httpStatus, errorCode, errorType);
            Object started = request.getAttribute(RequestCorrelationFilter.STARTED_AT_ATTRIBUTE);
            Long durationMs = started instanceof Long startedAt
                    ? Math.max(0, (System.nanoTime() - startedAt) / 1_000_000) : null;
            PlatformFailureEventRecord record = new PlatformFailureEventRecord(
                    java.util.UUID.randomUUID().toString(), fingerprint, CorrelationIdContext.current(),
                    bounded(environment == null || environment.isBlank() ? "unknown" : environment, 64),
                    "orithos-backend", runtimeCommit,
                    tenant == null ? null : tenant.getId(), tenant == null ? null : bounded(tenant.getName(), 255),
                    tenant == null ? null : bounded(tenant.getSubdomain(), 63),
                    actor == null ? null : actor.id(), actor == null ? null : bounded(actor.username(), 120),
                    method == null ? "UNKNOWN" : method, path == null ? "/" : path,
                    httpStatus, errorCode, errorType == null ? "UnknownException" : errorType,
                    safeSummary(error.getMessage()), durationMs, LocalDateTime.now(ZoneOffset.UTC));
            if (mapper.insert(record) != 1) throw new IllegalStateException("Failure event was not inserted");
            if (alerts != null) {
                alerts.record(fingerprint, record.environment(), record.service(), record.tenantId(),
                        record.correlationId(), record.runtimeCommit(), record.occurredAt());
            }
        } catch (RuntimeException persistenceError) {
            log.error("Platform failure event could not be persisted correlationId={} failureType={} captureErrorType={}",
                    CorrelationIdContext.current(), error == null ? "unknown" : error.getClass().getSimpleName(),
                    persistenceError.getClass().getSimpleName());
        }
    }

    @Transactional(readOnly = true)
    public List<PlatformFailureEvent> search(Long tenantId, String query, Integer httpStatus, Integer errorCode,
                                              LocalDateTime from, LocalDateTime to, int page, int size) {
        return mapper.search(tenantId, query, httpStatus, errorCode, from, to,
                size, (long) (page - 1) * size);
    }

    @Transactional(readOnly = true)
    public long count(Long tenantId, String query, Integer httpStatus, Integer errorCode,
                      LocalDateTime from, LocalDateTime to) {
        return mapper.count(tenantId, query, httpStatus, errorCode, from, to);
    }

    private String runtimeCommit() {
        try {
            Map<String, Object> version = buildIdentity.version().getBody();
            Object commit = version == null ? null : version.get("commit");
            return commit instanceof String value && value.matches("[a-f0-9]{40}") ? value : null;
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private static String safeSummary(String message) {
        if (message == null || message.isBlank()) return null;
        String safe = BEARER_TOKEN.matcher(message).replaceAll("$1[REDACTED]");
        safe = SECRET_ASSIGNMENT.matcher(safe).replaceAll("$1[REDACTED]");
        safe = EMAIL.matcher(safe).replaceAll("[EMAIL]");
        safe = PHONE.matcher(safe).replaceAll("[PHONE]");
        return safe.substring(0, Math.min(500, safe.length()));
    }

    private static String safePath(String path) {
        return path == null ? null : SENSITIVE_PATH_SEGMENT.matcher(path).replaceAll("$1[REDACTED]");
    }

    private static String bounded(String value, int max) {
        if (value == null) return null;
        return value.substring(0, Math.min(value.length(), max));
    }

    private static String fingerprint(String environment, String commit, Long tenantId, String method,
                                     String path, int status, Integer code, String type) {
        String value = String.join("|", nullToEmpty(environment), nullToEmpty(commit),
                tenantId == null ? "platform" : tenantId.toString(), nullToEmpty(method),
                nullToEmpty(path), Integer.toString(status), code == null ? "" : code.toString(), nullToEmpty(type));
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is unavailable", impossible);
        }
    }

    private static String nullToEmpty(String value) { return value == null ? "" : value; }
}
