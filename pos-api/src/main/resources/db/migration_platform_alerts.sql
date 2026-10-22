-- Deduplicated operational alerts backed by failure fingerprints.
CREATE TABLE IF NOT EXISTS platform_alert (
  id BIGINT NOT NULL AUTO_INCREMENT,
  fingerprint CHAR(64) NOT NULL,
  environment VARCHAR(64) NOT NULL,
  service VARCHAR(64) NOT NULL,
  tenant_id BIGINT NULL,
  status VARCHAR(16) NOT NULL,
  assignee VARCHAR(120) NULL,
  acknowledgement_note VARCHAR(500) NULL,
  resolution_note VARCHAR(500) NULL,
  first_seen_at DATETIME(3) NOT NULL,
  last_seen_at DATETIME(3) NOT NULL,
  occurrence_count BIGINT NOT NULL DEFAULT 1,
  latest_correlation_id CHAR(36) NULL,
  runtime_commit CHAR(40) NULL,
  acknowledged_at DATETIME(3) NULL,
  resolved_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_platform_alert_fingerprint (fingerprint),
  KEY idx_platform_alert_status_time (status, last_seen_at, id),
  KEY idx_platform_alert_tenant_time (tenant_id, last_seen_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
