CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('bluesky', 'x')),
  source_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  text TEXT NOT NULL,
  url TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS signals_created_at_idx
  ON signals (created_at DESC);

CREATE TABLE IF NOT EXISTS sync_state (
  source TEXT PRIMARY KEY,
  cursor TEXT,
  backfill_complete INTEGER NOT NULL DEFAULT 0,
  last_synced_at TEXT,
  last_error TEXT
);
