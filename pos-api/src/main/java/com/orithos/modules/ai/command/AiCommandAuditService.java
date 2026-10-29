package com.orithos.modules.ai.command;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.config.CorrelationIdContext;
import com.orithos.modules.ai.report.TenantContext;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.UUID;

@Service
public class AiCommandAuditService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    @Value("${SOURCE_COMMIT:unknown}") private String sourceCommit;

    public AiCommandAuditService(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc; this.mapper = mapper;
    }

    public void record(TenantContext tenant, UUID commandId, String event,
                       AiCommandStatus from, AiCommandStatus to, String confirmationMode,
                       Map<String, ?> safeResult) {
        try {
            String payload = mapper.writeValueAsString(safeResult == null ? Map.of() : safeResult);
            jdbc.update("""
                    INSERT INTO ai_command_audit
                    (command_id, vendor_id, outlet_id, user_id, event_type, from_status,
                     to_status, confirmation_mode, result_json, correlation_id, source_commit, runtime_commit)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?)
                    """, commandId, tenant.vendorId(), tenant.requireOutletId(), tenant.userId(), event,
                    from == null ? null : from.name(), to == null ? null : to.name(), confirmationMode,
                    payload, CorrelationIdContext.current(), sourceCommit, runtimeCommit());
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("audit result is not serializable", e);
        }
    }

    private String runtimeCommit() {
        try (var in = getClass().getResourceAsStream("/build-identity.properties")) {
            if (in == null) return "unknown";
            java.util.Properties properties = new java.util.Properties();
            properties.load(in);
            String value = properties.getProperty("commit", "unknown");
            return value.matches("[a-f0-9]{40}") ? value : "unknown";
        } catch (Exception ignored) { return "unknown"; }
    }
}
