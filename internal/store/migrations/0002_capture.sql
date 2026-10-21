-- No note/task text is retained here. The digest and receipt deduplicate retries,
-- including across restarts; an interrupted request is never sent a second time.
CREATE TABLE capture_requests (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  digest TEXT NOT NULL,
  http_status INTEGER NOT NULL DEFAULT 0,
  result TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, request_id)
);
