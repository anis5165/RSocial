-- MCP OAuth 2.1 support for ChatGPT / remote MCP clients

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS rs_mcp_clients (
  client_id VARCHAR(64) NOT NULL,
  client_secret_hash VARCHAR(255) NULL,
  client_name VARCHAR(255) NULL,
  redirect_uris JSON NOT NULL,
  grant_types JSON NOT NULL,
  response_types JSON NOT NULL,
  token_endpoint_auth_method VARCHAR(64) NOT NULL DEFAULT 'none',
  scope VARCHAR(255) NULL,
  client_id_issued_at INT UNSIGNED NOT NULL,
  client_secret_expires_at INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rs_mcp_pending_auth (
  id VARCHAR(36) NOT NULL,
  client_id VARCHAR(64) NOT NULL,
  redirect_uri VARCHAR(1024) NOT NULL,
  code_challenge VARCHAR(255) NOT NULL,
  code_challenge_method VARCHAR(16) NOT NULL DEFAULT 'S256',
  state VARCHAR(512) NULL,
  scopes VARCHAR(512) NULL,
  resource VARCHAR(1024) NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_rs_mcp_pending_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rs_mcp_auth_codes (
  code_hash VARCHAR(128) NOT NULL,
  client_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  redirect_uri VARCHAR(1024) NOT NULL,
  code_challenge VARCHAR(255) NOT NULL,
  scopes VARCHAR(512) NULL,
  resource VARCHAR(1024) NULL,
  expires_at DATETIME(3) NOT NULL,
  used TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (code_hash),
  KEY idx_rs_mcp_codes_user (user_id),
  CONSTRAINT fk_rs_mcp_codes_user FOREIGN KEY (user_id) REFERENCES rs_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rs_mcp_tokens (
  token_hash VARCHAR(128) NOT NULL,
  token_type VARCHAR(16) NOT NULL,
  client_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  scopes VARCHAR(512) NULL,
  resource VARCHAR(1024) NULL,
  refresh_token_hash VARCHAR(128) NULL,
  expires_at DATETIME(3) NOT NULL,
  revoked TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (token_hash),
  KEY idx_rs_mcp_tokens_user (user_id),
  KEY idx_rs_mcp_tokens_refresh (refresh_token_hash),
  CONSTRAINT fk_rs_mcp_tokens_user FOREIGN KEY (user_id) REFERENCES rs_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
