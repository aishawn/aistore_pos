package com.orithos.tenant;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.common.PageResult;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.Locale;

@RestController
@RequestMapping("/api/admin/alerts")
public class PlatformAlertController {
    private final PlatformAlertService alerts;
    private final PlatformAccessService access;
    private final PlatformAdminAuditService audit;
    public PlatformAlertController(PlatformAlertService alerts, PlatformAccessService access, PlatformAdminAuditService audit) { this.alerts = alerts; this.access = access; this.audit = audit; }

    @GetMapping
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<PageResult<PlatformAlert>> search(@RequestParam(required=false) String status,
                                                        @RequestParam(required=false) Long tenantId,
                                                        @RequestParam(defaultValue="1") int page,
                                                        @RequestParam(defaultValue="50") int size) {
        access.requirePlatformAdmin();
        String normalized = status == null || status.isBlank() ? null : status.trim().toUpperCase(Locale.ROOT);
        if (normalized != null && !java.util.Set.of("OPEN", "ACKNOWLEDGED", "RESOLVED").contains(normalized)) throw new BusinessException(40000, "Invalid alert status filter");
        int safePage = Math.max(1, page), safeSize = Math.min(100, Math.max(1, size));
        return ApiResult.ok(PageResult.of(alerts.search(normalized, tenantId, safePage, safeSize), alerts.count(normalized, tenantId), safePage, safeSize));
    }

    public record StatusRequest(String status, String assignee, String note) {}
    @PostMapping("/{fingerprint}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Void> update(@PathVariable String fingerprint, @RequestBody StatusRequest request) {
        access.requirePlatformAdmin();
        if (request == null) throw new BusinessException(40000, "Request body is required");
        String status = request.status() == null ? null : request.status().trim().toUpperCase(Locale.ROOT);
        String eventId = audit.begin(null, "ALERT_" + status, "PLATFORM_ALERT", fingerprint, request.note(), null);
        try {
            alerts.update(fingerprint, status, request.assignee(), request.note());
            audit.succeeded(eventId, java.util.Map.of("status", status));
        } catch (RuntimeException error) {
            audit.failed(eventId, PlatformAdminAuditService.errorCode(error), error.getClass().getSimpleName());
            throw error;
        }
        return ApiResult.ok(null);
    }
}
