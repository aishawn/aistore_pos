package com.orithos.tenant;

import com.orithos.common.BusinessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

@Service
public class PlatformAlertService {
    private final PlatformAlertMapper mapper;
    public PlatformAlertService(PlatformAlertMapper mapper) { this.mapper = mapper; }

    @Transactional
    public void record(String fingerprint, String environment, String service, Long tenantId,
                       String correlationId, String runtimeCommit, LocalDateTime occurredAt) {
        mapper.upsert(fingerprint, environment, service, tenantId, correlationId, runtimeCommit, occurredAt);
    }

    @Transactional(readOnly = true)
    public List<PlatformAlert> search(String status, Long tenantId, int page, int size) {
        return mapper.search(status, tenantId, size, (long) (page - 1) * size);
    }
    @Transactional(readOnly = true)
    public long count(String status, Long tenantId) { return mapper.count(status, tenantId); }

    @Transactional
    public void update(String fingerprint, String status, String assignee, String note) {
        if (fingerprint == null || !fingerprint.matches("[a-f0-9]{64}")) throw new BusinessException(40000, "Invalid alert fingerprint");
        if (!"ACKNOWLEDGED".equals(status) && !"RESOLVED".equals(status)) throw new BusinessException(40000, "Invalid alert status");
        if (note == null || note.isBlank()) throw new BusinessException(40000, "A processing note is required");
        int changed = mapper.updateStatus(fingerprint, status, trim(assignee, 120), trim(note, 500),
                "RESOLVED".equals(status) ? trim(note, 500) : null, LocalDateTime.now(ZoneOffset.UTC));
        if (changed != 1) throw new BusinessException(40400, "Alert not found");
    }
    private static String trim(String value, int max) { return value == null ? null : value.trim().substring(0, Math.min(max, value.trim().length())); }
}
