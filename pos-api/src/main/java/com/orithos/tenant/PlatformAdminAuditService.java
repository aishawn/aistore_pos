package com.orithos.tenant;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.BusinessException;
import com.orithos.modules.vendor.Vendor;
import com.orithos.security.AuthUser;
import com.orithos.security.CurrentUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;
import java.util.List;

@Service
public class PlatformAdminAuditService {

    private static final Logger log = LoggerFactory.getLogger(PlatformAdminAuditService.class);

    private final PlatformAdminAuditMapper mapper;
    private final ObjectMapper objectMapper;

    public PlatformAdminAuditService(PlatformAdminAuditMapper mapper, ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public String begin(Vendor tenant, String action, String targetType, String targetId,
                      String reason, Map<String, ?> before) {
        AuthUser actor = CurrentUser.get();
        PlatformAdminAuditEntry entry = new PlatformAdminAuditEntry(
                null, UUID.randomUUID().toString(), MDC.get("correlationId"),
                tenant == null ? null : tenant.getId(),
                tenant == null ? null : tenant.getName(), tenant == null ? null : tenant.getSubdomain(),
                actor == null ? null : actor.id(), actor == null ? null : actor.username(),
                action, targetType, targetId, normalizeReason(reason), "IN_PROGRESS",
                toJson(before), null, null, null, LocalDateTime.now(ZoneOffset.UTC), null);
        if (mapper.insert(entry) != 1) {
            throw new IllegalStateException("Platform audit event was not persisted");
        }
        return entry.eventId();
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void succeeded(String eventId, Map<String, ?> after) {
        try {
            finish(eventId, "SUCCEEDED", after, null, null);
        } catch (RuntimeException error) {
            log.error("Platform audit event completion failed eventId={}", eventId);
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void failed(String eventId, Integer errorCode, String errorType) {
        try {
            finish(eventId, "FAILED", null, errorCode, errorType);
        } catch (RuntimeException error) {
            log.error("Platform audit failure recording failed eventId={}", eventId);
        }
    }

    @Transactional(readOnly = true)
    public List<PlatformAdminAuditEntry> pageForTenant(long tenantId, int page, int size) {
        return mapper.pageForTenant(tenantId, size, (page - 1) * size);
    }

    @Transactional(readOnly = true)
    public long countForTenant(long tenantId) {
        return mapper.countForTenant(tenantId);
    }

    @Transactional(readOnly = true)
    public List<PlatformAdminAuditEntry> searchGlobal(Long tenantId, String query, String action,
                                                       String outcome, LocalDateTime from, LocalDateTime to,
                                                       int page, int size) {
        return mapper.searchGlobal(tenantId, query, action, outcome, from, to,
                size, (long) (page - 1) * size);
    }

    @Transactional(readOnly = true)
    public long countGlobal(Long tenantId, String query, String action, String outcome,
                            LocalDateTime from, LocalDateTime to) {
        return mapper.countGlobal(tenantId, query, action, outcome, from, to);
    }

    private void finish(String eventId, String outcome, Map<String, ?> after,
                        Integer errorCode, String errorType) {
        int changed = mapper.finish(eventId, outcome, toJson(after), errorCode,
                errorType == null ? null : errorType.substring(0, Math.min(120, errorType.length())),
                LocalDateTime.now(ZoneOffset.UTC));
        if (changed != 1) throw new IllegalStateException("Audit event could not be completed");
    }

    private String toJson(Map<String, ?> value) {
        if (value == null) return null;
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException error) {
            throw new IllegalArgumentException("Audit summary could not be serialized", error);
        }
    }

    private static String normalizeReason(String reason) {
        if (reason == null || reason.isBlank()) return "平台管理员操作（未提供原因）";
        String normalized = reason.trim();
        return normalized.substring(0, Math.min(500, normalized.length()));
    }

    public static Integer errorCode(RuntimeException error) {
        return error instanceof BusinessException business ? business.getCode() : null;
    }
}
