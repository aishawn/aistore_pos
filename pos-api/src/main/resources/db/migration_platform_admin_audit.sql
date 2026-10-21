-- Durable audit trail for platform tenant lifecycle operations.
-- Apply once before deploying the backend/UI that use platform_admin_audit.
CREATE TABLE IF NOT EXISTS platform_admin_audit (
  id BIGINT NOT NULL AUTO_INCREMENT,
  event_id CHAR(36) NOT NULL,
  correlation_id CHAR(36) NULL,
  tenant_id BIGINT NULL,
  tenant_name VARCHAR(255) NULL,
  tenant_slug VARCHAR(63) NULL,
  actor_id BIGINT NULL,
  actor_username VARCHAR(120) NULL,
  action VARCHAR(48) NOT NULL,
  target_type VARCHAR(48) NOT NULL,
  target_id VARCHAR(120) NULL,
  reason VARCHAR(500) NOT NULL,
  outcome VARCHAR(16) NOT NULL,
  before_summary TEXT NULL,
  after_summary TEXT NULL,
  error_code INT NULL,
  error_type VARCHAR(120) NULL,
  created_at DATETIME NOT NULL,
  completed_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_platform_admin_audit_event (event_id),
  KEY idx_platform_admin_audit_tenant_time (tenant_id, created_at, id),
  KEY idx_platform_admin_audit_actor_time (actor_id, created_at, id),
  KEY idx_platform_admin_audit_correlation (correlation_id),
  KEY idx_platform_admin_audit_action_time (action, created_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
