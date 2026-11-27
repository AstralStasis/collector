CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  username VARCHAR(32) COLLATE utf8mb4_0900_as_ci UNIQUE,
  password_hash VARCHAR(512),
  created_at BIGINT NOT NULL,
  CHECK ((username IS NULL AND password_hash IS NULL) OR (username IS NOT NULL AND password_hash IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS catalog_items (
  item_key VARCHAR(96) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  sort_order BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE,
  game_id BIGINT NOT NULL,
  category VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  english VARCHAR(255) NOT NULL,
  patch VARCHAR(32) NOT NULL,
  source_type VARCHAR(64) NOT NULL,
  document JSON NOT NULL,
  INDEX catalog_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS catalog_metadata (
  id TINYINT PRIMARY KEY,
  digest CHAR(64) CHARACTER SET ascii NOT NULL,
  document JSON NOT NULL,
  updated_at BIGINT NOT NULL,
  CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS exchange_offers (
  item_key VARCHAR(96) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  currency VARCHAR(64) NOT NULL,
  amount BIGINT NOT NULL,
  expansion VARCHAR(32) NOT NULL DEFAULT '',
  region VARCHAR(128) NOT NULL DEFAULT '',
  `rank` INT,
  PRIMARY KEY (item_key, currency, amount, expansion, region),
  FOREIGN KEY (item_key) REFERENCES catalog_items(item_key) ON DELETE CASCADE,
  CHECK (amount >= 0),
  INDEX exchange_route (currency, expansion, region)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS profiles (
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  display_name VARCHAR(72) NOT NULL,
  server_name VARCHAR(96) NOT NULL,
  is_demo TINYINT NOT NULL,
  preferences JSON NOT NULL,
  activity JSON NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (is_demo IN (0, 1)),
  CHECK (revision >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS collection_entries (
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  item_key VARCHAR(96) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  owned TINYINT NOT NULL DEFAULT 0,
  wishlist TINYINT NOT NULL DEFAULT 0,
  plan_position INT,
  PRIMARY KEY (user_id, item_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (item_key) REFERENCES catalog_items(item_key),
  CHECK (owned IN (0, 1)),
  CHECK (wishlist IN (0, 1)),
  CHECK (plan_position >= 0),
  CHECK (NOT (owned = 1 AND wishlist = 1)),
  CHECK (owned = 1 OR wishlist = 1 OR plan_position IS NOT NULL),
  INDEX collection_plan (user_id, plan_position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  csrf_token VARCHAR(64) CHARACTER SET ascii NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX sessions_expiration (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
