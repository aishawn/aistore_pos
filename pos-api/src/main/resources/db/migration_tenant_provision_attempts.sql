-- Append-only history for Odoo tenant provisioning attempts and their steps.
-- Apply before deploying the backend or platform UI that reads this history.
CREATE TABLE IF NOT EXISTS tenant_provision_attempt (
  attempt_id CHAR(36) NOT NULL,
  tenant_id BIGINT NOT NULL,
  tenant_name VARCHAR(255) NULL,
  tenant_slug VARCHAR(63) NULL,
  trigger_type VARCHAR(32) NOT NULL,
  actor_id BIGINT NULL,
  actor_username VARCHAR(120) NULL,
  correlation_id CHAR(36) NULL,
  outcome VARCHAR(16) NOT NULL,
  current_step VARCHAR(64) NULL,
  error_type VARCHAR(120) NULL,
  error_summary VARCHAR(500) NULL,
  started_at DATETIME(3) NOT NULL,
  completed_at DATETIME(3) NULL,
  PRIMARY KEY (attempt_id),
  KEY idx_tenant_provision_attempt_tenant_time (tenant_id, started_at, attempt_id),
  KEY idx_tenant_provision_attempt_correlation (correlation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tenant_provision_attempt_step (
  step_id CHAR(36) NOT NULL,
  attempt_id CHAR(36) NOT NULL,
  step_name VARCHAR(64) NOT NULL,
  outcome VARCHAR(16) NOT NULL,
  resource_ref VARCHAR(240) NULL,
  error_type VARCHAR(120) NULL,
  error_summary VARCHAR(500) NULL,
  started_at DATETIME(3) NOT NULL,
  completed_at DATETIME(3) NULL,
  PRIMARY KEY (step_id),
  KEY idx_tenant_provision_step_attempt_time (attempt_id, started_at, step_id),
  CONSTRAINT fk_tenant_provision_step_attempt
    FOREIGN KEY (attempt_id) REFERENCES tenant_provision_attempt(attempt_id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
