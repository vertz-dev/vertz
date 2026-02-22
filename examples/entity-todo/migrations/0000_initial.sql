--
-- Initial schema for todos table
--

CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index on completed column for better query performance
CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed);
