-- Sample-data lifecycle flags for go-live purge (idempotent adds).
ALTER TABLE vendor
  ADD COLUMN dummy_data_requested BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN sample_data_cleared_at TIMESTAMP NULL;
