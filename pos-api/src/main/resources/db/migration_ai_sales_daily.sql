CREATE TABLE IF NOT EXISTS ai_sales_daily (
    id BIGSERIAL PRIMARY KEY,
    vendor_id BIGINT NOT NULL,
    outlet_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    business_date DATE NOT NULL,
    units_sold NUMERIC(18,4) NOT NULL DEFAULT 0,
    net_sales NUMERIC(18,4) NOT NULL DEFAULT 0,
    orders_count INTEGER NOT NULL DEFAULT 0,
    average_price NUMERIC(18,4),
    stockout_flag BOOLEAN NOT NULL DEFAULT FALSE,
    source_system VARCHAR(40) NOT NULL DEFAULT 'odoo',
    source_version VARCHAR(160) NOT NULL,
    data_as_of TIMESTAMP WITH TIME ZONE NOT NULL,
    data_quality_status VARCHAR(32) NOT NULL DEFAULT 'VALID',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_ai_sales_daily_scope UNIQUE
        (vendor_id, outlet_id, product_id, business_date, source_system)
);

CREATE INDEX IF NOT EXISTS idx_ai_sales_daily_series
    ON ai_sales_daily (vendor_id, outlet_id, product_id, business_date);

CREATE TABLE IF NOT EXISTS ai_inventory_daily (
    id BIGSERIAL PRIMARY KEY,
    vendor_id BIGINT NOT NULL,
    outlet_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    business_date DATE NOT NULL,
    on_hand NUMERIC(18,4),
    virtual_available NUMERIC(18,4),
    on_order NUMERIC(18,4) NOT NULL DEFAULT 0,
    stockout_flag BOOLEAN NOT NULL DEFAULT FALSE,
    source_version VARCHAR(160) NOT NULL,
    data_as_of TIMESTAMP WITH TIME ZONE NOT NULL,
    data_quality_status VARCHAR(32) NOT NULL DEFAULT 'VALID',
    CONSTRAINT uq_ai_inventory_daily_scope UNIQUE
        (vendor_id, outlet_id, product_id, business_date)
);

CREATE INDEX IF NOT EXISTS idx_ai_inventory_daily_series
    ON ai_inventory_daily (vendor_id, outlet_id, product_id, business_date);

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
