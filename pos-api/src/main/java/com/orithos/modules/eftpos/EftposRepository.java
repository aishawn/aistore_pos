package com.orithos.modules.eftpos;

import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.Optional;

@Repository
public class EftposRepository {
    private final JdbcTemplate jdbc;

    public EftposRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

  public record BindingRow(
            long vendorId,
            long outletId,
            long registerId,
            boolean enabled,
            boolean paymentsEnabled,
            String integrationMode,
            String connectorBaseUrl,
            String terminalLabel,
            String terminalModel,
            String acquirer,
            String connectorToken,
            OffsetDateTime updatedAt
    ) {
    }

    public record AttemptRow(
            long id,
            long vendorId,
            long outletId,
            long registerId,
            String orderUuid,
            int amountCents,
            String currency,
            String quoteSignature,
            String status,
            String providerReference,
            String connectorChallenge
    ) {
    }

    private static final RowMapper<BindingRow> BINDING_MAPPER = new RowMapper<>() {
        @Override
        public BindingRow mapRow(ResultSet rs, int rowNum) throws SQLException {
            return new BindingRow(
                    rs.getLong("vendor_id"),
                    rs.getLong("outlet_id"),
                    rs.getLong("register_id"),
                    rs.getBoolean("enabled"),
                    rs.getBoolean("payments_enabled"),
                    rs.getString("integration_mode"),
                    rs.getString("connector_base_url"),
                    rs.getString("terminal_label"),
                    rs.getString("terminal_model"),
                    rs.getString("acquirer"),
                    rs.getString("connector_token"),
                    rs.getObject("updated_at", OffsetDateTime.class)
            );
        }
    };

    private static final RowMapper<AttemptRow> ATTEMPT_MAPPER = new RowMapper<>() {
        @Override
        public AttemptRow mapRow(ResultSet rs, int rowNum) throws SQLException {
            return new AttemptRow(
                    rs.getLong("id"),
                    rs.getLong("vendor_id"),
                    rs.getLong("outlet_id"),
                    rs.getLong("register_id"),
                    rs.getString("order_uuid"),
                    rs.getInt("amount_cents"),
                    rs.getString("currency"),
                    rs.getString("quote_signature"),
                    rs.getString("status"),
                    rs.getString("provider_reference"),
                    rs.getString("connector_challenge")
            );
        }
    };

    public Optional<BindingRow> findBinding(long vendorId, long registerId) {
        try {
            return Optional.ofNullable(jdbc.queryForObject(
                    """
                    SELECT vendor_id, outlet_id, register_id, enabled, payments_enabled, integration_mode,
                           connector_base_url, terminal_label, terminal_model, acquirer, connector_token, updated_at
                    FROM register_eftpos_binding
                    WHERE vendor_id = ? AND register_id = ?
                    """,
                    BINDING_MAPPER,
                    vendorId,
                    registerId
            ));
        } catch (EmptyResultDataAccessException ex) {
            return Optional.empty();
        }
    }

    public void upsertBinding(BindingRow binding) {
        jdbc.update(
                """
                INSERT INTO register_eftpos_binding (
                    vendor_id, outlet_id, register_id, enabled, payments_enabled, integration_mode,
                    connector_base_url, terminal_label, terminal_model, acquirer, connector_token, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                ON CONFLICT (vendor_id, register_id) DO UPDATE SET
                    outlet_id = EXCLUDED.outlet_id,
                    enabled = EXCLUDED.enabled,
                    payments_enabled = EXCLUDED.payments_enabled,
                    integration_mode = EXCLUDED.integration_mode,
                    connector_base_url = EXCLUDED.connector_base_url,
                    terminal_label = EXCLUDED.terminal_label,
                    terminal_model = EXCLUDED.terminal_model,
                    acquirer = EXCLUDED.acquirer,
                    connector_token = EXCLUDED.connector_token,
                    updated_at = NOW()
                """,
                binding.vendorId(),
                binding.outletId(),
                binding.registerId(),
                binding.enabled(),
                binding.paymentsEnabled(),
                binding.integrationMode(),
                binding.connectorBaseUrl(),
                binding.terminalLabel(),
                binding.terminalModel(),
                binding.acquirer(),
                binding.connectorToken()
        );
    }

    public Optional<AttemptRow> findAttemptByOrderUuid(long vendorId, String orderUuid) {
        try {
            return Optional.ofNullable(jdbc.queryForObject(
                    """
                    SELECT id, vendor_id, outlet_id, register_id, order_uuid, amount_cents, currency,
                           quote_signature, status, provider_reference, connector_challenge
                    FROM eftpos_payment_attempt
                    WHERE vendor_id = ? AND order_uuid = ?
                    """,
                    ATTEMPT_MAPPER,
                    vendorId,
                    orderUuid
            ));
        } catch (EmptyResultDataAccessException ex) {
            return Optional.empty();
        }
    }

    public Optional<AttemptRow> findAttemptByIdGlobal(long attemptId) {
        try {
            return Optional.ofNullable(jdbc.queryForObject(
                    """
                    SELECT id, vendor_id, outlet_id, register_id, order_uuid, amount_cents, currency,
                           quote_signature, status, provider_reference, connector_challenge
                    FROM eftpos_payment_attempt
                    WHERE id = ?
                    """,
                    ATTEMPT_MAPPER,
                    attemptId
            ));
        } catch (EmptyResultDataAccessException ex) {
            return Optional.empty();
        }
    }

    public Optional<AttemptRow> findAttemptById(long vendorId, long attemptId) {
        try {
            return Optional.ofNullable(jdbc.queryForObject(
                    """
                    SELECT id, vendor_id, outlet_id, register_id, order_uuid, amount_cents, currency,
                           quote_signature, status, provider_reference, connector_challenge
                    FROM eftpos_payment_attempt
                    WHERE vendor_id = ? AND id = ?
                    """,
                    ATTEMPT_MAPPER,
                    vendorId,
                    attemptId
            ));
        } catch (EmptyResultDataAccessException ex) {
            return Optional.empty();
        }
    }

    public boolean hasActiveAttempt(long vendorId, long registerId) {
        Integer count = jdbc.queryForObject(
                """
                SELECT COUNT(*) FROM eftpos_payment_attempt
                WHERE vendor_id = ? AND register_id = ? AND status IN ('PENDING', 'DISPATCHED', 'UNKNOWN', 'APPROVED_PENDING_SETTLEMENT')
                """,
                Integer.class,
                vendorId,
                registerId
        );
        return count != null && count > 0;
    }

    public void lockRegisterForAttemptCreation(long vendorId, long registerId) {
        jdbc.query(
                "SELECT pg_advisory_xact_lock(hashtext(?))",
                (ResultSetExtractor<Void>) resultSet -> null,
                "eftpos:" + vendorId + ":" + registerId
        );
    }

    public void lockOrderForAttemptCreation(long vendorId, String orderUuid) {
        jdbc.query(
                "SELECT pg_advisory_xact_lock(hashtext(?))",
                (ResultSetExtractor<Void>) resultSet -> null,
                "eftpos-order:" + vendorId + ":" + orderUuid
        );
    }

    public int markAttemptDispatched(long vendorId, long attemptId) {
        return jdbc.update(
                """
                UPDATE eftpos_payment_attempt
                SET status = 'DISPATCHED', updated_at = NOW()
                WHERE vendor_id = ? AND id = ? AND status = 'PENDING'
                """,
                vendorId,
                attemptId
        );
    }

    public Optional<AttemptRow> findLatestActiveAttempt(long vendorId, long registerId) {
        try {
            return Optional.ofNullable(jdbc.queryForObject(
                    """
                    SELECT id, vendor_id, outlet_id, register_id, order_uuid, amount_cents, currency,
                           quote_signature, status, provider_reference, connector_challenge
                    FROM eftpos_payment_attempt
                    WHERE vendor_id = ? AND register_id = ? AND status IN ('PENDING', 'DISPATCHED', 'UNKNOWN')
                    ORDER BY updated_at DESC, id DESC
                    LIMIT 1
                    """,
                    ATTEMPT_MAPPER,
                    vendorId,
                    registerId
            ));
        } catch (EmptyResultDataAccessException ex) {
            return Optional.empty();
        }
    }

    public long insertAttempt(AttemptRow attempt) {
        return jdbc.queryForObject(
                """
                INSERT INTO eftpos_payment_attempt (
                    vendor_id, outlet_id, register_id, order_uuid, amount_cents, currency,
                    quote_signature, status, provider_reference, connector_challenge, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NOW())
                RETURNING id
                """,
                Long.class,
                attempt.vendorId(),
                attempt.outletId(),
                attempt.registerId(),
                attempt.orderUuid(),
                attempt.amountCents(),
                attempt.currency(),
                attempt.quoteSignature(),
                attempt.status(),
                attempt.connectorChallenge()
        );
    }

    public int updateAttemptStatus(long vendorId, long attemptId, String status, String providerReference) {
        return jdbc.update(
                """
                UPDATE eftpos_payment_attempt
                SET status = ?, provider_reference = COALESCE(?, provider_reference), updated_at = NOW()
                WHERE vendor_id = ? AND id = ?
                  AND (
                    status = ?
                    OR (status IN ('PENDING', 'DISPATCHED', 'UNKNOWN') AND ? IN ('APPROVED', 'APPROVED_PENDING_SETTLEMENT', 'DECLINED', 'CANCELLED', 'UNKNOWN'))
                    OR (status = 'APPROVED_PENDING_SETTLEMENT' AND ? = 'APPROVED')
                  )
                """,
                status,
                providerReference,
                vendorId,
                attemptId,
                status,
                status,
                status
        );
    }
}
