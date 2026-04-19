import type { Message } from '../loop/react-loop';
import type { AgentSession, AgentStore, ListSessionsFilter } from './types';

// ---------------------------------------------------------------------------
// D1 binding types (minimal subset, avoids @cloudflare/workers-types dep)
// ---------------------------------------------------------------------------

/** Minimal D1 binding interface — matches Cloudflare's D1Database. */
export interface D1Binding {
  exec(query: string): Promise<unknown>;
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result<unknown>[]>;
}

/** Minimal D1 prepared-statement shape — matches Cloudflare's `D1PreparedStatement`. */
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result<unknown>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}

/** Minimal D1 result shape — matches Cloudflare's `D1Result`. */
export interface D1Result<T> {
  results: T[];
  success: boolean;
}

// ---------------------------------------------------------------------------
// Schema (same as sqliteStore)
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

export interface D1StoreOptions {
  /** The D1 database binding from the Worker environment. */
  readonly binding: D1Binding;
}

// ---------------------------------------------------------------------------
// Helpers
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

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Cloudflare D1-backed store for agent sessions and messages.
 * Uses the raw D1 binding (not @vertz/db wrapper).
 *
 * Available from both the main entry and the Cloudflare subpath:
 *
 * ```ts
 * import { d1Store } from '@vertz/agents';
 * const store = d1Store({ binding: env.DB });
 * ```
 */
export function d1Store(options: D1StoreOptions): AgentStore {
  const db = options.binding;
  let initialized = false;

  async function ensureTables(): Promise<void> {
    if (initialized) return;
    await db.exec(SCHEMA);
    initialized = true;
  }

  return {
    async loadSession(sessionId) {
      await ensureTables();
      const row = await db
        .prepare('SELECT * FROM agent_sessions WHERE id = ?')
        .bind(sessionId)
        .first<SessionRow>();
      return row ? rowToSession(row) : null;
    },

    async saveSession(session) {
      await ensureTables();
      await db
        .prepare(
          `INSERT INTO agent_sessions (id, agent_name, user_id, tenant_id, state, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             user_id = excluded.user_id,
             tenant_id = excluded.tenant_id,
             state = excluded.state,
             updated_at = excluded.updated_at`,
        )
        .bind(
          session.id,
          session.agentName,
          session.userId,
          session.tenantId,
          session.state,
          session.createdAt,
          session.updatedAt,
        )
        .run();
    },

    async loadMessages(sessionId) {
      await ensureTables();
      const result = await db
        .prepare('SELECT * FROM agent_messages WHERE session_id = ? ORDER BY seq ASC')
        .bind(sessionId)
        .all<MessageRow>();
      return result.results.map(rowToMessage);
    },

    async appendMessages(sessionId, messages) {
      await ensureTables();
      const seqResult = await db
        .prepare('SELECT MAX(seq) as max_seq FROM agent_messages WHERE session_id = ?')
        .bind(sessionId)
        .first<{ max_seq: number | null }>();
      let seq = ((seqResult?.max_seq as number | null) ?? 0) + 1;
      const now = new Date().toISOString();

      const statements: D1PreparedStatement[] = [];
      for (const msg of messages) {
        statements.push(
          db
            .prepare(
              `INSERT INTO agent_messages (session_id, seq, role, content, tool_call_id, tool_name, tool_calls, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              sessionId,
              seq,
              msg.role,
              msg.content,
              msg.toolCallId ?? null,
              msg.toolName ?? null,
              msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
              now,
            ),
        );
        seq++;
      }

      if (statements.length > 0) {
        await db.batch(statements);
      }
    },

    async pruneMessages(sessionId, keepCount) {
      await ensureTables();
      await db
        .prepare(
          `DELETE FROM agent_messages
           WHERE session_id = ?
             AND seq NOT IN (
               SELECT seq FROM agent_messages
               WHERE session_id = ?
               ORDER BY seq DESC
               LIMIT ?
             )`,
        )
        .bind(sessionId, sessionId, keepCount)
        .run();
    },

    async deleteSession(sessionId) {
      await ensureTables();
      await db.prepare('DELETE FROM agent_sessions WHERE id = ?').bind(sessionId).run();
    },

    async listSessions(filter?: ListSessionsFilter) {
      await ensureTables();
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

      let stmt = db.prepare(query);
      if (params.length > 0) {
        stmt = stmt.bind(...params);
      }
      const result = await stmt.all<SessionRow>();
      return result.results.map(rowToSession);
    },
  };
}
