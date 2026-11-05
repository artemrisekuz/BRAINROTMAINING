-- Migration 0003: promo codes + admin list
-- Run: npx wrangler d1 migrations apply brainrot-mining-db --remote

-- Admin list (can have multiple admins)
CREATE TABLE IF NOT EXISTS admins (
  player_id  TEXT PRIMARY KEY,  -- "TG<telegramId>"
  added_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed the original hardcoded admin
INSERT OR IGNORE INTO admins (player_id) VALUES ('TG6987783335');

-- Promo codes table
CREATE TABLE IF NOT EXISTS promo_codes (
  code        TEXT PRIMARY KEY,               -- e.g. "SUMMER2025"
  type        TEXT NOT NULL,                  -- 'coins' | 'case'
  value       INTEGER NOT NULL DEFAULT 0,     -- coins amount OR 0 for case promo
  case_id     TEXT,                           -- case id if type='case', else NULL
  uses_left   INTEGER NOT NULL DEFAULT 1,     -- -1 = unlimited
  expires_at  TEXT,                           -- ISO datetime or NULL
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  created_by  TEXT NOT NULL                   -- player_id of creator
);

-- Track which players already used which promo
CREATE TABLE IF NOT EXISTS promo_uses (
  code       TEXT NOT NULL,
  player_id  TEXT NOT NULL,
  used_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (code, player_id)
);
