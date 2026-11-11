-- These daily tables were populated from Odoo snapshots and are no longer read.
DROP TABLE IF EXISTS ai_sales_daily;
DROP TABLE IF EXISTS ai_inventory_daily;

CREATE TABLE IF NOT EXISTS ai_forecast_snapshot (
    id UUID PRIMARY KEY,
    vendor_id BIGINT NOT NULL,
    outlet_id BIGINT NOT NULL,
    forecast_type VARCHAR(32) NOT NULL,
    model_name VARCHAR(120) NOT NULL,
    model_version VARCHAR(160) NOT NULL,
    source_version VARCHAR(160) NOT NULL,
    horizon_days INTEGER NOT NULL,
    data_as_of TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(32) NOT NULL,
    forecast_json JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_forecast_scope
    ON ai_forecast_snapshot (vendor_id, outlet_id, forecast_type, created_at DESC);
