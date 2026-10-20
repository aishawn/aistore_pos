-- Cashier-owned AI chat history (not exposed on the platform control plane).
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS ai_chat_thread (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  vendor_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  session_key VARCHAR(160) NOT NULL,
  title VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_ai_chat_thread_session (session_key),
  KEY idx_ai_chat_thread_owner (vendor_id, user_id, updated_at)
);

CREATE TABLE IF NOT EXISTS ai_chat_message (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  thread_id BIGINT NOT NULL,
  role VARCHAR(16) NOT NULL,
  text_content MEDIUMTEXT NOT NULL,
  intent VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ai_chat_message_thread (thread_id, id),
  CONSTRAINT fk_ai_chat_message_thread
    FOREIGN KEY (thread_id) REFERENCES ai_chat_thread (id) ON DELETE CASCADE
);
