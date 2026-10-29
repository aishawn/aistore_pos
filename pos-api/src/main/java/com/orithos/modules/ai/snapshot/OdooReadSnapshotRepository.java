package com.orithos.modules.ai.snapshot;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.modules.ai.report.TenantContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Repository
public class OdooReadSnapshotRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public OdooReadSnapshotRepository(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    public List<SnapshotRow> findVersion(TenantContext tenant, String sourceVersion, String objectType) {
        return jdbc.query("""
                SELECT source_record_id, data_quality_status, payload::text
                FROM odoo_read_snapshot
                WHERE vendor_id = ? AND outlet_id = ? AND source_version = ? AND object_type = ?
                ORDER BY id
                """, (rs, rowNum) -> {
            Map<String, Object> payload = new LinkedHashMap<>();
            try {
                JsonNode node = mapper.readTree(rs.getString(3));
                node.fields().forEachRemaining(entry -> payload.put(entry.getKey(), mapper.convertValue(entry.getValue(), Object.class)));
            } catch (Exception error) {
                payload.put("_parseError", error.getClass().getSimpleName());
            }
            return new SnapshotRow(rs.getString(1), rs.getString(2), payload);
        }, tenant.vendorId(), tenant.requireOutletId(), sourceVersion, objectType);
    }

    public record SnapshotRow(String sourceRecordId, String dataQualityStatus, Map<String, Object> payload) { }
}
