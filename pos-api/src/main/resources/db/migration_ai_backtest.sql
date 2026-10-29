CREATE TABLE IF NOT EXISTS ai_decision_backtest_run (
  id UUID PRIMARY KEY,
  vendor_id BIGINT NOT NULL,
  outlet_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  decision_type VARCHAR(32) NOT NULL CHECK (decision_type IN ('PRICING', 'REPLENISHMENT')),
  window_from TIMESTAMPTZ NOT NULL,
  window_to TIMESTAMPTZ NOT NULL,
  source_version VARCHAR(128) NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('PASS', 'FAIL', 'BLOCKED')),
  metrics_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ai_backtest_scope_time
  ON ai_decision_backtest_run(vendor_id, outlet_id, decision_type, created_at DESC);
