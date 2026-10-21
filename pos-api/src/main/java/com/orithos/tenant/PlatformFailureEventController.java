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

@RestController
@RequestMapping("/api/admin/failures")
public class PlatformFailureEventController {

    private final PlatformFailureEventService failureEvents;
    private final PlatformAccessService platformAccess;

    public PlatformFailureEventController(PlatformFailureEventService failureEvents,
                                          PlatformAccessService platformAccess) {
        this.failureEvents = failureEvents;
        this.platformAccess = platformAccess;
    }

    @GetMapping("/events")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<PageResult<PlatformFailureEvent>> search(
            @RequestParam(required = false) Long tenantId,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Integer httpStatus,
            @RequestParam(required = false) Integer errorCode,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int size) {
        platformAccess.requirePlatformAdmin();
        if (tenantId != null && tenantId < 1) throw new BusinessException(40000, "Invalid store filter");
        if (httpStatus != null && httpStatus != 200 && (httpStatus < 500 || httpStatus > 599)) {
            throw new BusinessException(40000, "HTTP status filter must be 200 or a server error code");
        }
        String query = bounded(q);
        LocalDateTime fromUtc = utc(from, "from");
        LocalDateTime toUtc = utc(to, "to");
        if (fromUtc != null && toUtc != null && fromUtc.isAfter(toUtc)) {
            throw new BusinessException(40000, "The start time must be before the end time");
        }
        int safePage = Math.max(1, Math.min(page, 1_000_000));
        int safeSize = Math.min(100, Math.max(1, size));
        List<PlatformFailureEvent> items = failureEvents.search(tenantId, query, httpStatus, errorCode,
                fromUtc, toUtc, safePage, safeSize);
        long total = failureEvents.count(tenantId, query, httpStatus, errorCode, fromUtc, toUtc);
        return ApiResult.ok(PageResult.of(items, total, safePage, safeSize));
    }

    private static String bounded(String value) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim();
        if (normalized.length() > 120) throw new BusinessException(40000, "Search query is too long");
        return normalized;
    }

    private static LocalDateTime utc(String value, String label) {
        if (value == null || value.isBlank()) return null;
        try {
            return OffsetDateTime.parse(value.trim()).withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime();
        } catch (DateTimeParseException error) {
            throw new BusinessException(40000, "Invalid " + label + " timestamp; use ISO-8601 with an offset");
        }
    }
}
