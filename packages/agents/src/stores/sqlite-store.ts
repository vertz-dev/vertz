import { Database } from 'bun:sqlite';
import type { Message } from '../loop/react-loop';
import type { AgentSession, AgentStore, ListSessionsFilter } from './types';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  agent_name TEXT NOT NULL,
  user_id TEXT,
  tenant_id TEXT,
  state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_agent ON agent_sessions(agent_name);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON agent_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON agent_sessions(updated_at);

CREATE TABLE IF NOT EXISTS agent_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_call_id TEXT,
  tool_name TEXT,
  tool_calls TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(session_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON agent_messages(session_id, seq);
`;

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

interface SessionRow {
  id: string;
  agent_name: string;
  user_id: string | null;
  tenant_id: string | null;
  state: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  session_id: string;
  seq: number;
  role: string;
  content: string;
  tool_call_id: string | null;
  tool_name: string | null;
  tool_calls: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface SqliteStoreOptions {
  /** Path to the SQLite database file, or ':memory:' for in-memory. */
  readonly path: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

function rowToSession(row: SessionRow): AgentSession {
  return {
    id: row.id,
    agentName: row.agent_name,
    userId: row.user_id,
    tenantId: row.tenant_id,
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row: MessageRow): Message {
  return {
    role: row.role as Message['role'],
    content: row.content,
    ...(row.tool_call_id ? { toolCallId: row.tool_call_id } : {}),
    ...(row.tool_name ? { toolName: row.tool_name } : {}),
    ...(row.tool_calls ? { toolCalls: JSON.parse(row.tool_calls) } : {}),
  };
}

/**
 * SQLite-backed store for agent sessions and messages.
 * Uses bun:sqlite for persistence. Supports both file-based and :memory: databases.
 */
export function sqliteStore(options: SqliteStoreOptions): AgentStore {
  const db = new Database(options.path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);

  // Prepared statements
  const loadSessionStmt = db.prepare<SessionRow, [string]>(
    'SELECT * FROM agent_sessions WHERE id = ?',
  );

  const upsertSessionStmt = db.prepare<
    void,
    [string, string, string | null, string | null, string, string, string]
  >(
    `INSERT INTO agent_sessions (id, agent_name, user_id, tenant_id, state, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       state = excluded.state,
       updated_at = excluded.updated_at`,
  );

  const deleteSessionStmt = db.prepare<void, [string]>('DELETE FROM agent_sessions WHERE id = ?');

  const loadMessagesStmt = db.prepare<MessageRow, [string]>(
    'SELECT * FROM agent_messages WHERE session_id = ? ORDER BY seq ASC',
  );

  const maxSeqStmt = db.prepare<{ max_seq: number | null }, [string]>(
    'SELECT MAX(seq) as max_seq FROM agent_messages WHERE session_id = ?',
  );

  const insertMessageStmt = db.prepare<
    void,
    [string, number, string, string, string | null, string | null, string | null, string]
  >(
    `INSERT INTO agent_messages (session_id, seq, role, content, tool_call_id, tool_name, tool_calls, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  return {
    async loadSession(sessionId) {
      const row = loadSessionStmt.get(sessionId);
      return row ? rowToSession(row) : null;
    },

    async saveSession(session) {
      upsertSessionStmt.run(
        session.id,
        session.agentName,
        session.userId,
        session.tenantId,
        session.state,
        session.createdAt,
        session.updatedAt,
      );
    },

    async loadMessages(sessionId) {
      const rows = loadMessagesStmt.all(sessionId);
      return rows.map(rowToMessage);
    },

    async appendMessages(sessionId, messages) {
      const result = maxSeqStmt.get(sessionId);
      let seq = (result?.max_seq ?? 0) + 1;
      const now = new Date().toISOString();

      const tx = db.transaction(() => {
        for (const msg of messages) {
          insertMessageStmt.run(
            sessionId,
            seq,
            msg.role,
            msg.content,
            msg.toolCallId ?? null,
            msg.toolName ?? null,
            msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
            now,
          );
          seq++;
        }
      });
      tx();
    },

    async deleteSession(sessionId) {
      deleteSessionStmt.run(sessionId);
    },

    async listSessions(filter?: ListSessionsFilter) {
      let query = 'SELECT * FROM agent_sessions WHERE 1=1';
      const params: (string | number)[] = [];

      if (filter?.agentName) {
        query += ' AND agent_name = ?';
        params.push(filter.agentName);
      }
      if (filter?.userId) {
        query += ' AND user_id = ?';
        params.push(filter.userId);
      }

      query += ' ORDER BY updated_at DESC';

      if (filter?.limit) {
        query += ' LIMIT ?';
        params.push(filter.limit);
      }

      const rows = db.prepare<SessionRow, (string | number)[]>(query).all(...params);
      return rows.map(rowToSession);
    },
  };
}
