-- Snapshot of an AI report query so the chat can link to a dedicated results page.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS ai_report_snapshot (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  vendor_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  outlet_id BIGINT NULL,
  intent VARCHAR(64) NULL,
  question TEXT NULL,
  title VARCHAR(512) NULL,
  result_json MEDIUMTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ai_report_snapshot_user (vendor_id, user_id, created_at)
);
