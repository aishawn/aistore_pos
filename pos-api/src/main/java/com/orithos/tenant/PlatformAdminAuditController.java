package com.orithos.tenant;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.common.PageResult;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@RestController
@RequestMapping("/api/admin/audit")
public class PlatformAdminAuditController {

    private static final Set<String> OUTCOMES = Set.of("IN_PROGRESS", "SUCCEEDED", "FAILED");
    private final PlatformAdminAuditService auditService;
    private final PlatformAccessService platformAccess;

    public PlatformAdminAuditController(PlatformAdminAuditService auditService,
                                        PlatformAccessService platformAccess) {
        this.auditService = auditService;
        this.platformAccess = platformAccess;
    }

    @GetMapping("/events")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<PageResult<PlatformAdminAuditEntry>> search(
            @RequestParam(required = false) Long tenantId,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String outcome,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int size) {
        platformAccess.requirePlatformAdmin();
        if (tenantId != null && tenantId < 1) throw new BusinessException(40000, "Invalid tenant filter");
        String query = bounded(q, 120, "Search query");
        String actionFilter = bounded(action, 80, "Action filter");
        String outcomeFilter = outcome == null || outcome.isBlank() ? null : outcome.trim().toUpperCase(Locale.ROOT);
        if (outcomeFilter != null && !OUTCOMES.contains(outcomeFilter)) {
            throw new BusinessException(40000, "Invalid audit outcome filter");
        }
        LocalDateTime fromUtc = utc(from, "from");
        LocalDateTime toUtc = utc(to, "to");
        if (fromUtc != null && toUtc != null && fromUtc.isAfter(toUtc)) {
            throw new BusinessException(40000, "The start time must be before the end time");
        }

        int safePage = Math.max(1, page);
        int safeSize = Math.min(100, Math.max(1, size));
        List<PlatformAdminAuditEntry> items = auditService.searchGlobal(
                tenantId, query, actionFilter, outcomeFilter, fromUtc, toUtc, safePage, safeSize);
        long total = auditService.countGlobal(tenantId, query, actionFilter, outcomeFilter, fromUtc, toUtc);
        return ApiResult.ok(PageResult.of(items, total, safePage, safeSize));
    }

    private static String bounded(String value, int max, String label) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim();
        if (normalized.length() > max) throw new BusinessException(40000, label + " is too long");
        return normalized;
    }

    private static LocalDateTime utc(String value, String label) {
        if (value == null || value.isBlank()) return null;
        try {
            return OffsetDateTime.parse(value.trim()).withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime();
        } catch (DateTimeParseException error) {
            throw new BusinessException(40000, "Invalid " + label + " timestamp; use an ISO-8601 offset timestamp");
        }
    }
}
