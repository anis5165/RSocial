-- Routism Social — initial schema
-- Tables are prefixed with rs_ to avoid collisions on shared Hostinger DBs
-- (e.g. an existing coupon `users` table caused errno 150 on FK create).

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS rs_users (
  id VARCHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_rs_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rs_accounts (
  id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  platform VARCHAR(32) NOT NULL,
  platform_account_id VARCHAR(128) NOT NULL,
  username VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NULL,
  encrypted_access_token TEXT NOT NULL,
  refresh_token TEXT NULL,
  token_expires_at DATETIME(3) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'connected',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_rs_accounts_platform_account (platform, platform_account_id),
  KEY idx_rs_accounts_user_id (user_id),
  KEY idx_rs_accounts_platform (platform),
  KEY idx_rs_accounts_user_platform (user_id, platform),
  CONSTRAINT fk_rs_accounts_user FOREIGN KEY (user_id) REFERENCES rs_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rs_oauth_states (
  id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  state VARCHAR(128) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  used TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_rs_oauth_states_state (state),
  KEY idx_rs_oauth_states_user_id (user_id),
  KEY idx_rs_oauth_states_expires (expires_at),
  CONSTRAINT fk_rs_oauth_states_user FOREIGN KEY (user_id) REFERENCES rs_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rs_media (
  id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  cloudinary_public_id VARCHAR(512) NOT NULL,
  cloudinary_url VARCHAR(1024) NOT NULL,
  secure_url VARCHAR(1024) NOT NULL,
  resource_type VARCHAR(32) NOT NULL DEFAULT 'image',
  mime_type VARCHAR(128) NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  width INT UNSIGNED NULL,
  height INT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_rs_media_user_id (user_id),
  KEY idx_rs_media_created_at (created_at),
  CONSTRAINT fk_rs_media_user FOREIGN KEY (user_id) REFERENCES rs_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rs_posts (
  id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  caption TEXT NOT NULL,
  media_id VARCHAR(36) NULL,
  scheduled_at DATETIME(3) NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  error_message TEXT NULL,
  publish_lock_token VARCHAR(36) NULL,
  published_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_rs_posts_user_id (user_id),
  KEY idx_rs_posts_status (status),
  KEY idx_rs_posts_scheduled_at (scheduled_at),
  KEY idx_rs_posts_user_status (user_id, status),
  KEY idx_rs_posts_due (status, scheduled_at),
  CONSTRAINT fk_rs_posts_user FOREIGN KEY (user_id) REFERENCES rs_users (id) ON DELETE CASCADE,
  CONSTRAINT fk_rs_posts_media FOREIGN KEY (media_id) REFERENCES rs_media (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rs_deliveries (
  id VARCHAR(36) NOT NULL,
  post_id VARCHAR(36) NOT NULL,
  account_id VARCHAR(36) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  remote_post_id VARCHAR(255) NULL,
  response LONGTEXT NULL,
  error_message TEXT NULL,
  idempotency_key VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_rs_deliveries_idempotency (idempotency_key),
  KEY idx_rs_deliveries_post_id (post_id),
  KEY idx_rs_deliveries_account_id (account_id),
  KEY idx_rs_deliveries_status (status),
  CONSTRAINT fk_rs_deliveries_post FOREIGN KEY (post_id) REFERENCES rs_posts (id) ON DELETE CASCADE,
  CONSTRAINT fk_rs_deliveries_account FOREIGN KEY (account_id) REFERENCES rs_accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
