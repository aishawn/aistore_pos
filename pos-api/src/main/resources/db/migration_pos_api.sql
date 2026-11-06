CREATE TABLE IF NOT EXISTS pos_api_token (
    id BIGSERIAL PRIMARY KEY,
    vendor_id BIGINT NOT NULL,
    created_by BIGINT NULL,
    token_hash VARCHAR(128) NOT NULL UNIQUE,
    token_prefix VARCHAR(24) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    scopes TEXT NOT NULL,
    expires_at TIMESTAMP NULL,
    revoked_at TIMESTAMP NULL,
    last_used_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pos_api_token_vendor ON pos_api_token(vendor_id);
CREATE TABLE IF NOT EXISTS pos_api_idempotency (
    id BIGSERIAL PRIMARY KEY,
    vendor_id BIGINT NOT NULL,
    token_id BIGINT NOT NULL,
    operation_id UUID NULL,
    idempotency_key VARCHAR(200) NOT NULL,
    request_hash VARCHAR(128) NOT NULL,
    status VARCHAR(30) NOT NULL,
    response_json TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    UNIQUE(vendor_id, token_id, idempotency_key)
);
ALTER TABLE pos_api_idempotency ADD COLUMN IF NOT EXISTS operation_id UUID NULL;
CREATE TABLE IF NOT EXISTS pos_api_operation (
    id UUID PRIMARY KEY,
    vendor_id BIGINT NOT NULL,
    token_id BIGINT NOT NULL,
    resource VARCHAR(40) NOT NULL,
    status VARCHAR(24) NOT NULL,
    accepted INTEGER NOT NULL DEFAULT 0,
    created_count INTEGER NOT NULL DEFAULT 0,
    updated_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    result_json TEXT NULL,
    error_json TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pos_api_operation_vendor ON pos_api_operation(vendor_id, created_at DESC);
CREATE TABLE IF NOT EXISTS pos_api_webhook (
    id BIGSERIAL PRIMARY KEY,
    vendor_id BIGINT NOT NULL,
    token_id BIGINT NOT NULL,
    endpoint_url VARCHAR(500) NOT NULL,
    secret_hash VARCHAR(128) NOT NULL,
    secret_ciphertext TEXT NULL,
    events TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS pos_api_webhook_delivery (
    id BIGSERIAL PRIMARY KEY,
    webhook_id BIGINT NOT NULL,
    event_id UUID NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    payload_json TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    next_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    claimed_until TIMESTAMP NULL,
    delivered_at TIMESTAMP NULL,
    UNIQUE(webhook_id, event_id)
);
ALTER TABLE pos_api_webhook_delivery ADD COLUMN IF NOT EXISTS claimed_until TIMESTAMP NULL;
