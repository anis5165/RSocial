-- ChatGPT Plugin/App Actions connection tracking + request idempotency

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS rs_chatgpt_connections (
  id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  provider VARCHAR(32) NOT NULL DEFAULT 'chatgpt',
  client_id VARCHAR(64) NOT NULL,
  external_subject VARCHAR(255) NULL,
  scopes VARCHAR(512) NOT NULL DEFAULT 'chatgpt:actions',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  last_used_at DATETIME(3) NULL,
  revoked_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_rs_chatgpt_conn_user (user_id),
  KEY idx_rs_chatgpt_conn_status (status),
  KEY idx_rs_chatgpt_conn_client_user (client_id, user_id),
  CONSTRAINT fk_rs_chatgpt_conn_user FOREIGN KEY (user_id) REFERENCES rs_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rs_idempotency_keys (
  id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  operation VARCHAR(64) NOT NULL,
  request_hash VARCHAR(128) NOT NULL,
  response_json LONGTEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'completed',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rs_idempotency_user_key_op (user_id, idempotency_key, operation),
  KEY idx_rs_idempotency_expires (expires_at),
  CONSTRAINT fk_rs_idempotency_user FOREIGN KEY (user_id) REFERENCES rs_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
