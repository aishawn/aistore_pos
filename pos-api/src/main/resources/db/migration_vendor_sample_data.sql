-- Sample-data lifecycle flags for go-live purge (idempotent adds).
ALTER TABLE vendor
  ADD COLUMN dummy_data_requested TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 if signup requested DEMO sample seed',
  ADD COLUMN sample_data_cleared_at DATETIME NULL
    COMMENT 'When owner removed sample data from this store';
