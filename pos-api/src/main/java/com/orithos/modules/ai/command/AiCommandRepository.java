package com.orithos.modules.ai.command;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.modules.ai.report.TenantContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Repository
public class AiCommandRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public AiCommandRepository(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    public void insert(UUID id, TenantContext tenant, AiCommandType type, AiCommandStatus status,
                       String sourceText, String threadId, double confidence, Instant expiresAt,
                       String version, List<AiCommandDtos.CommandItem> items,
                       List<AiCommandDtos.CommandItem> excludedItems, Map<String, Object> changes,
                       String idempotencyKey) {
        jdbc.update("""
                INSERT INTO ai_command_draft
                (id, vendor_id, outlet_id, user_id, command_type, status, source_text,
                 source_thread_id, confidence, expires_at, command_version, items_json,
                 excluded_items_json, changes_json, idempotency_key)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?)
                """, id, tenant.vendorId(), tenant.requireOutletId(), tenant.userId(),
                type.name(), status.name(), sourceText, threadId, confidence, expiresAt,
                version, json(items), json(excludedItems), json(changes), idempotencyKey);
    }

    public Draft find(UUID id, TenantContext tenant) {
        List<Draft> rows = jdbc.query("""
                SELECT id, command_type, status, source_text, source_thread_id, confidence,
                       expires_at, command_version, items_json, excluded_items_json, changes_json,
                       idempotency_key
                FROM ai_command_draft
                WHERE id = ? AND vendor_id = ? AND outlet_id = ? AND user_id = ?
                """, (rs, n) -> new Draft(
                UUID.fromString(rs.getString("id")),
                AiCommandType.valueOf(rs.getString("command_type")),
                AiCommandStatus.valueOf(rs.getString("status")),
                rs.getString("source_text"), rs.getString("source_thread_id"),
                rs.getDouble("confidence"), rs.getObject("expires_at", Instant.class),
                rs.getString("command_version"), readList(rs.getString("items_json")),
                readList(rs.getString("excluded_items_json")), readMap(rs.getString("changes_json")),
                rs.getString("idempotency_key")), id, tenant.vendorId(), tenant.requireOutletId(), tenant.userId());
        return rows.isEmpty() ? null : rows.get(0);
    }

    public int updateStatus(UUID id, TenantContext tenant, AiCommandStatus expected,
                            AiCommandStatus next) {
        return jdbc.update("""
                UPDATE ai_command_draft SET status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND vendor_id = ? AND outlet_id = ? AND user_id = ? AND status = ?
                """, next.name(), id, tenant.vendorId(), tenant.requireOutletId(), tenant.userId(), expected.name());
    }

    private String json(Object value) {
        try { return mapper.writeValueAsString(value == null ? Map.of() : value); }
        catch (JsonProcessingException e) { throw new IllegalArgumentException("command JSON encoding failed", e); }
    }
    private List<AiCommandDtos.CommandItem> readList(String value) {
        try { return value == null ? List.of() : mapper.readerForListOf(AiCommandDtos.CommandItem.class).readValue(value); }
        catch (Exception e) { throw new IllegalStateException("command draft is malformed", e); }
    }
    private Map<String, Object> readMap(String value) {
        try { return value == null ? Map.of() : mapper.readValue(value, Map.class); }
        catch (Exception e) { throw new IllegalStateException("command draft is malformed", e); }
    }

    public record Draft(UUID id, AiCommandType type, AiCommandStatus status, String sourceText,
                        String threadId, double confidence, Instant expiresAt, String version,
                        List<AiCommandDtos.CommandItem> items,
                        List<AiCommandDtos.CommandItem> excludedItems,
                        Map<String, Object> changes, String idempotencyKey) { }
}
