-- Brainrot Mining D1 schema
-- Run: wrangler d1 migrations apply brainrot-mining-db

CREATE TABLE IF NOT EXISTS accounts (
  player_id   TEXT    PRIMARY KEY,  -- "TG<telegramId>" or "LOCAL_<hash>"
  username    TEXT,                 -- Telegram @username, nullable
  name        TEXT    NOT NULL DEFAULT 'Telegram user',
  balance     INTEGER NOT NULL DEFAULT 30,
  cases_opened INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory (
  drop_id     TEXT    PRIMARY KEY,
  player_id   TEXT    NOT NULL REFERENCES accounts(player_id) ON DELETE CASCADE,
  item_id     TEXT    NOT NULL,
  case_id     TEXT,               -- NULL for upgrade results
  kind        TEXT    NOT NULL DEFAULT 'case',  -- 'case' | 'upgrade'
  source_item_id TEXT,            -- for upgrades: what was sacrificed
  opened_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  player_name TEXT    NOT NULL DEFAULT 'Telegram'
);

CREATE INDEX IF NOT EXISTS idx_inventory_player ON inventory(player_id);

CREATE TABLE IF NOT EXISTS history (
  drop_id     TEXT    PRIMARY KEY,
  player_id   TEXT    NOT NULL,
  player_name TEXT    NOT NULL DEFAULT 'Telegram',
  item_id     TEXT    NOT NULL,
  case_id     TEXT,
  kind        TEXT    NOT NULL DEFAULT 'case',
  opened_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_history_player ON history(player_id);
CREATE INDEX IF NOT EXISTS idx_history_time   ON history(opened_at DESC);
