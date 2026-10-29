package com.orithos.modules.ai.decision;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.BusinessException;
import com.orithos.config.CorrelationIdContext;
import com.orithos.modules.ai.report.TenantContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Repository
public class AiDecisionRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public AiDecisionRepository(JdbcTemplate jdbc, ObjectMapper mapper) { this.jdbc = jdbc; this.mapper = mapper; }

    public UUID insert(TenantContext tenant, String type, Instant asOf, String configVersion, Object decision) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO ai_decision_snapshot
                (id, vendor_id, outlet_id, decision_type, source_system, source_version,
                 data_as_of, config_version, status, decision_json, created_by)
                VALUES (?, ?, ?, ?, 'odoo-live', ?, ?, ?, 'PREVIEW', ?::jsonb, ?)
                """, id, tenant.vendorId(), tenant.requireOutletId(), type,
                "unversioned", Timestamp.from(asOf), configVersion, json(decision), tenant.userId());
        return id;
    }

    public void feedback(TenantContext tenant, UUID snapshotId, String action, Object before, Object after, String note) {
        int inserted = jdbc.update("""
                INSERT INTO ai_decision_audit
                (snapshot_id, vendor_id, outlet_id, user_id, action, before_json, after_json, note, correlation_id)
                SELECT id, vendor_id, outlet_id, ?, ?, ?::jsonb, ?::jsonb, ?, ?
                FROM ai_decision_snapshot
                WHERE id = ? AND vendor_id = ? AND outlet_id = ?
                """, tenant.userId(), action, json(before), json(after), note,
                CorrelationIdContext.current(), snapshotId, tenant.vendorId(), tenant.requireOutletId());
        if (inserted != 1) throw new BusinessException(40410, "AI decision snapshot was not found");
    }

    public String decisionType(TenantContext tenant, UUID snapshotId) {
        try {
            return jdbc.queryForObject("""
                    SELECT decision_type FROM ai_decision_snapshot
                    WHERE id = ? AND vendor_id = ? AND outlet_id = ?
                    """, String.class, snapshotId, tenant.vendorId(), tenant.requireOutletId());
        } catch (EmptyResultDataAccessException missing) {
            throw new BusinessException(40410, "AI decision snapshot was not found");
        }
    }

    public List<Map<String, Object>> list(TenantContext tenant, String type, int limit) {
        return jdbc.queryForList("""
                SELECT id, decision_type AS type, source_system AS source, source_version AS sourceVersion,
                       data_as_of AS dataAsOf, computed_at AS computedAt, config_version AS configVersion,
                       status, decision_json AS decision, data_quality_json AS dataQuality
                FROM ai_decision_snapshot
                WHERE vendor_id = ? AND outlet_id = ? AND decision_type = ?
                ORDER BY computed_at DESC LIMIT ?
                """, tenant.vendorId(), tenant.requireOutletId(), type, Math.max(1, Math.min(limit, 100)));
    }

    private String json(Object value) {
        try { return mapper.writeValueAsString(value == null ? Map.of() : value); }
        catch (JsonProcessingException e) { throw new IllegalArgumentException("decision JSON encoding failed", e); }
    }
}
