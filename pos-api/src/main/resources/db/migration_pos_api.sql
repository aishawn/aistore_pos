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
    idempotency_key VARCHAR(200) NOT NULL,
    request_hash VARCHAR(128) NOT NULL,
    status VARCHAR(30) NOT NULL,
    response_json TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    UNIQUE(vendor_id, token_id, idempotency_key)
);
