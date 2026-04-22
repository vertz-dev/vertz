-- Migration 001: add RLS columns (user_id, tenant_id) to agent_messages.
--
-- Applies to existing databases created by earlier versions of sqliteStore / d1Store.
-- Fresh installs already include these columns via the updated DDL in the stores'
-- CREATE TABLE IF NOT EXISTS statements.
--
-- Rationale: #2847 bridges agent persistence with Vertz entity RLS. Entity access rules
-- are evaluated as flat equality against row data (access-enforcer.ts:64-72), so
-- enforcing `rules.where({ userId: rules.user.id })` on the Message entity requires
-- the userId column directly on the message row — a relation traversal is not
-- supported today.
--
-- RUN ONCE. The ALTER TABLE statements below will fail with "duplicate column name"
-- on a second run — SQLite/D1 don't support `ADD COLUMN IF NOT EXISTS`. Wire this
-- through a migration runner that tracks applied migrations (e.g. @vertz/db's
-- migrate commands, or Wrangler's `wrangler d1 migrations` for D1).

ALTER TABLE agent_messages ADD COLUMN user_id TEXT;
ALTER TABLE agent_messages ADD COLUMN tenant_id TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_user ON agent_messages(user_id);

-- Backfill userId / tenantId onto historical messages by joining through agent_sessions.
-- After this runs, existing message rows are visible to the Message entity's RLS reads.
UPDATE agent_messages
SET
  user_id = (SELECT user_id FROM agent_sessions WHERE agent_sessions.id = agent_messages.session_id),
  tenant_id = (SELECT tenant_id FROM agent_sessions WHERE agent_sessions.id = agent_messages.session_id)
WHERE user_id IS NULL;
