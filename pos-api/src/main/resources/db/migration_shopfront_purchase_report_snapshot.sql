CREATE TABLE IF NOT EXISTS shopfront_purchase_report_snapshot (
    store_key VARCHAR(64) NOT NULL,
    outlet_id BIGINT NOT NULL,
    business_date DATE NOT NULL,
    group_by VARCHAR(16) NOT NULL,
    rows_json TEXT NOT NULL,
    fetched_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (store_key, outlet_id, business_date, group_by)
);

CREATE INDEX IF NOT EXISTS idx_shopfront_purchase_report_outlet_date
    ON shopfront_purchase_report_snapshot (outlet_id, business_date);
