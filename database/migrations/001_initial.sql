CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE COLLATE NOCASE,
  password_hash TEXT,
  created_at INTEGER NOT NULL,
  CHECK ((username IS NULL AND password_hash IS NULL) OR (username IS NOT NULL AND password_hash IS NOT NULL))
) STRICT;
CREATE TABLE catalog_items (
  item_key TEXT PRIMARY KEY,
  game_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  english TEXT NOT NULL,
  patch TEXT NOT NULL,
  source_type TEXT NOT NULL,
  document TEXT NOT NULL CHECK(json_valid(document))
) STRICT;
CREATE INDEX catalog_category ON catalog_items(category);
CREATE TABLE catalog_metadata (id INTEGER PRIMARY KEY CHECK(id = 1), digest TEXT NOT NULL, document TEXT NOT NULL CHECK(json_valid(document)), updated_at INTEGER NOT NULL) STRICT;
CREATE TABLE exchange_offers (
  item_key TEXT NOT NULL REFERENCES catalog_items(item_key) ON DELETE CASCADE,
  currency TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount >= 0),
  expansion TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  rank INTEGER,
  PRIMARY KEY(item_key, currency, amount, expansion, region)
) STRICT;
CREATE INDEX exchange_route ON exchange_offers(currency, expansion, region);
CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  server_name TEXT NOT NULL,
  is_demo INTEGER NOT NULL CHECK(is_demo IN (0,1)),
  preferences TEXT NOT NULL CHECK(json_valid(preferences)),
  activity TEXT NOT NULL CHECK(json_valid(activity)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  updated_at INTEGER NOT NULL
) STRICT;
CREATE TABLE collection_entries (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL REFERENCES catalog_items(item_key),
  owned INTEGER NOT NULL DEFAULT 0 CHECK(owned IN (0,1)),
  wishlist INTEGER NOT NULL DEFAULT 0 CHECK(wishlist IN (0,1)),
  plan_position INTEGER CHECK(plan_position >= 0),
  PRIMARY KEY(user_id,item_key),
  CHECK(NOT(owned = 1 AND wishlist = 1)),
  CHECK(owned = 1 OR wishlist = 1 OR plan_position IS NOT NULL)
) STRICT;
CREATE INDEX collection_plan ON collection_entries(user_id,plan_position);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX sessions_expiration ON sessions(expires_at);
