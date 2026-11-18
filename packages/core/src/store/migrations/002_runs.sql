-- Run records and scores (US12 / data-model.md RunRecord + Score).
-- session_id has no FK so runs can outlive deleted sessions (keep-without-text).

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  cwd TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  outcome TEXT,
  permission_mode TEXT NOT NULL,
  model TEXT,
  mode TEXT,
  request_text TEXT,
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS runs_session_started
  ON runs (session_id, started_at DESC);

CREATE INDEX IF NOT EXISTS runs_agent_started
  ON runs (agent_id, started_at DESC);

CREATE INDEX IF NOT EXISTS runs_outcome_started
  ON runs (outcome, started_at DESC);

CREATE INDEX IF NOT EXISTS runs_cwd_started
  ON runs (cwd, started_at DESC);

CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  source TEXT NOT NULL,
  value REAL NOT NULL,
  scale_min REAL NOT NULL,
  scale_max REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS scores_run_source
  ON scores (run_id, source);

CREATE UNIQUE INDEX IF NOT EXISTS scores_one_user_per_run
  ON scores (run_id)
  WHERE source = 'user';
