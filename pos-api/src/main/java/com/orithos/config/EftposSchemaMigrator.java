package com.orithos.config;

import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Order(34)
public class EftposSchemaMigrator implements CommandLineRunner {
    private final JdbcTemplate jdbc;

    public EftposSchemaMigrator(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(String... args) {
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS register_eftpos_binding (
                    vendor_id BIGINT NOT NULL,
                    outlet_id BIGINT NOT NULL,
                    register_id BIGINT NOT NULL,
                    enabled BOOLEAN NOT NULL DEFAULT FALSE,
                    payments_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                    integration_mode VARCHAR(32) NOT NULL DEFAULT 'local_connector',
                    connector_base_url VARCHAR(255) NOT NULL DEFAULT 'http://127.0.0.1:9167',
                    terminal_label VARCHAR(120),
                    terminal_model VARCHAR(120),
                    acquirer VARCHAR(120),
                    connector_token VARCHAR(64) NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (vendor_id, register_id)
                )""");
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS eftpos_payment_attempt (
                    id BIGSERIAL PRIMARY KEY,
                    vendor_id BIGINT NOT NULL,
                    outlet_id BIGINT NOT NULL,
                    register_id BIGINT NOT NULL,
                    order_uuid VARCHAR(64) NOT NULL,
                    amount_cents INTEGER NOT NULL,
                    currency VARCHAR(3) NOT NULL DEFAULT 'AUD',
                    quote_signature TEXT,
                    status VARCHAR(32) NOT NULL,
                    provider_reference VARCHAR(120),
                    connector_challenge VARCHAR(64) NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (vendor_id, order_uuid)
                )""");
        jdbc.execute("CREATE INDEX IF NOT EXISTS idx_eftpos_attempt_register_status "
                + "ON eftpos_payment_attempt (vendor_id, register_id, status, updated_at DESC)");
    }
}