package com.orithos.modules.ai.command;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

@Repository
public class AiCommandRepository {
    private final JdbcTemplate jdbc;

    public AiCommandRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(UUID id, long vendorId, long userId, long outletId, String type,
                       String status, String payload, String sourceText, String threadId,
                       Instant expiresAt, String version, String idempotencyKey) {
        jdbc.update("""
                INSERT INTO ai_command_draft
                (id, vendor_id, user_id, outlet_id, command_type, status, payload_json,
                 source_text, source_thread_id, expires_at, version, idempotency_key)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, id.toString(), vendorId, userId, outletId, type, status, payload,
                sourceText, threadId, expiresAt == null ? null : Timestamp.from(expiresAt), version, idempotencyKey);
    }

    public Row find(UUID id) {
        return jdbc.query("SELECT id, vendor_id, user_id, outlet_id, command_type, status, " +
                "payload_json, source_text, source_thread_id, expires_at, version, idempotency_key " +
                "FROM ai_command_draft WHERE id = ?", rs -> rs.next()
                ? new Row(UUID.fromString(rs.getString("id")), rs.getLong("vendor_id"),
                rs.getLong("user_id"), rs.getLong("outlet_id"), rs.getString("command_type"),
                rs.getString("status"), rs.getString("payload_json"), rs.getString("source_text"),
                rs.getString("source_thread_id"), rs.getTimestamp("expires_at").toInstant(),
                rs.getString("version"), rs.getString("idempotency_key")) : null, id.toString());
    }

    public int updateStatus(UUID id, String status, String version) {
        return jdbc.update("UPDATE ai_command_draft SET status = ?, version = ?, " +
                "updated_at = CURRENT_TIMESTAMP WHERE id = ?", status, version, id.toString());
    }

    public int claimForExecution(UUID id, String expectedVersion, String nextVersion) {
        return jdbc.update("UPDATE ai_command_draft SET status = ?, version = ?, " +
                        "updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ? AND version = ?",
                AiCommandStatus.EXECUTING.name(), nextVersion, id.toString(),
                AiCommandStatus.PREVIEWED.name(), expectedVersion);
    }

    public int cancelPreview(UUID id, String expectedVersion) {
        return jdbc.update("UPDATE ai_command_draft SET status = ?, version = ?, " +
                        "updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN (?, ?) AND version = ?",
                AiCommandStatus.CANCELLED.name(), UUID.randomUUID().toString(), id.toString(),
                AiCommandStatus.DRAFT.name(), AiCommandStatus.PREVIEWED.name(), expectedVersion);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordTerminalFailure(UUID id, long vendorId, long userId, long outletId,
                                      String status, String detail) {
        jdbc.update("UPDATE ai_command_draft SET status = ?, version = ?, " +
                        "updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?",
                status, UUID.randomUUID().toString(), id.toString(), AiCommandStatus.EXECUTING.name());
        audit(id, vendorId, userId, outletId, status, detail, null);
    }

    public void audit(UUID id, long vendorId, long userId, long outletId, String event,
                      String detail, String correlationId) {
        jdbc.update("INSERT INTO ai_command_audit " +
                "(command_id, vendor_id, user_id, outlet_id, event_type, detail, correlation_id) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?)", id.toString(), vendorId, userId, outletId,
                event, detail, correlationId);
    }

    public record Row(UUID id, long vendorId, long userId, long outletId, String type,
                      String status, String payload, String sourceText, String threadId,
                      Instant expiresAt, String version, String idempotencyKey) {}
}
