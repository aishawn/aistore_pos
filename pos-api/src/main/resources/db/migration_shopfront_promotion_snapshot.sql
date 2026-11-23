CREATE TABLE IF NOT EXISTS shopfront_promotion_snapshot (
    outlet_id BIGINT PRIMARY KEY,
    snapshot_at TIMESTAMP WITH TIME ZONE NOT NULL,
    promotions JSONB NOT NULL CHECK (jsonb_typeof(promotions) = 'array')
);
