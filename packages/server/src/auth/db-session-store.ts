/**
 * DB-backed SessionStore implementation.
 *
 * Stores sessions in the auth_sessions table. current_tokens is stored
 * as JSON text for grace period support.
 */

import { sql } from '@vertz/db/sql';
import { type AuthDbClient, assertWrite } from './db-types';
import type { AuthTokens, SessionStore, StoredSession } from './types';

interface SessionRow {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  previous_refresh_hash: string | null;
  current_tokens: string | null;
  ip_address: string;
  user_agent: string;
  created_at: string;
  last_active_at: string;
  expires_at: string;
  revoked_at: string | null;
}

/** ORM record shape — camelCase fields, string dates. */
interface SessionRecord {
  id: string;
  userId: string;
  refreshTokenHash: string;
  previousRefreshHash: string | null;
  currentTokens: string | null;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export class DbSessionStore implements SessionStore {
  constructor(private db: AuthDbClient) {}

  async createSessionWithId(
    id: string,
    data: {
      userId: string;
      refreshTokenHash: string;
      ipAddress: string;
      userAgent: string;
      expiresAt: Date;
      currentTokens?: AuthTokens;
    },
  ): Promise<StoredSession> {
    const now = new Date();
    const tokensJson = data.currentTokens ? JSON.stringify(data.currentTokens) : null;

    const result = await this.db.query(
      sql`INSERT INTO auth_sessions (id, user_id, refresh_token_hash, previous_refresh_hash, current_tokens, ip_address, user_agent, created_at, last_active_at, expires_at, revoked_at)
          VALUES (${id}, ${data.userId}, ${data.refreshTokenHash}, ${null}, ${tokensJson}, ${data.ipAddress}, ${data.userAgent}, ${now.toISOString()}, ${now.toISOString()}, ${data.expiresAt.toISOString()}, ${null})`,
    );
    assertWrite(result, 'createSessionWithId');

    return {
      id,
      userId: data.userId,
      refreshTokenHash: data.refreshTokenHash,
      previousRefreshHash: null,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      createdAt: now,
      lastActiveAt: now,
      expiresAt: data.expiresAt,
      revokedAt: null,
    };
  }

  async findByRefreshHash(hash: string): Promise<StoredSession | null> {
    const nowStr = new Date().toISOString();
    const result = await this.db.auth_sessions.get({
      where: {
        refreshTokenHash: hash,
        revokedAt: null,
        expiresAt: { gt: nowStr },
      },
    });

    if (!result.ok) return null;
    const row = result.data;
    if (!row) return null;

    return this.recordToSession(row as SessionRecord);
  }

  async findActiveSessionById(id: string): Promise<StoredSession | null> {
    const nowStr = new Date().toISOString();
    const result = await this.db.auth_sessions.get({
      where: {
        id,
        revokedAt: null,
        expiresAt: { gt: nowStr },
      },
    });

    if (!result.ok) return null;
    const row = result.data;
    if (!row) return null;

    return this.recordToSession(row as SessionRecord);
  }

  async findByPreviousRefreshHash(hash: string): Promise<StoredSession | null> {
    const nowStr = new Date().toISOString();
    const result = await this.db.auth_sessions.get({
      where: {
        previousRefreshHash: hash,
        revokedAt: null,
        expiresAt: { gt: nowStr },
      },
    });

    if (!result.ok) return null;
    const row = result.data;
    if (!row) return null;

    return this.recordToSession(row as SessionRecord);
  }

  async revokeSession(id: string): Promise<void> {
    const nowStr = new Date().toISOString();
    const result = await this.db.query(
      sql`UPDATE auth_sessions SET revoked_at = ${nowStr}, current_tokens = ${null} WHERE id = ${id}`,
    );
    assertWrite(result, 'revokeSession');
  }

  async listActiveSessions(userId: string): Promise<StoredSession[]> {
    const nowStr = new Date().toISOString();
    const result = await this.db.query<SessionRow>(
      sql`SELECT * FROM auth_sessions WHERE user_id = ${userId} AND revoked_at IS NULL AND expires_at > ${nowStr}`,
    );

    if (!result.ok) return [];
    return result.data.rows.map((row) => this.rowToSession(row));
  }

  async countActiveSessions(userId: string): Promise<number> {
    const nowStr = new Date().toISOString();
    const result = await this.db.query<{ cnt: number }>(
      sql`SELECT COUNT(*) as cnt FROM auth_sessions WHERE user_id = ${userId} AND revoked_at IS NULL AND expires_at > ${nowStr}`,
    );

    if (!result.ok) return 0;
    return result.data.rows[0]?.cnt ?? 0;
  }

  async getCurrentTokens(sessionId: string): Promise<AuthTokens | null> {
    const result = await this.db.query<{ current_tokens: string | null }>(
      sql`SELECT current_tokens FROM auth_sessions WHERE id = ${sessionId} LIMIT 1`,
    );

    if (!result.ok) return null;
    const row = result.data.rows[0];
    if (!row?.current_tokens) return null;

    try {
      return JSON.parse(row.current_tokens) as AuthTokens;
    } catch {
      return null;
    }
  }

  async updateSession(
    id: string,
    data: {
      refreshTokenHash: string;
      previousRefreshHash: string;
      lastActiveAt: Date;
      currentTokens?: AuthTokens;
    },
  ): Promise<void> {
    const tokensJson = data.currentTokens ? JSON.stringify(data.currentTokens) : null;
    const result = await this.db.query(
      sql`UPDATE auth_sessions SET refresh_token_hash = ${data.refreshTokenHash}, previous_refresh_hash = ${data.previousRefreshHash}, last_active_at = ${data.lastActiveAt.toISOString()}, current_tokens = ${tokensJson} WHERE id = ${id}`,
    );
    assertWrite(result, 'updateSession');
  }

  dispose(): void {
    // No cleanup needed — DB handles it
  }

  /** Map a raw SQL row (snake_case) to StoredSession. */
  private rowToSession(row: SessionRow): StoredSession {
    return {
      id: row.id,
      userId: row.user_id,
      refreshTokenHash: row.refresh_token_hash,
      previousRefreshHash: row.previous_refresh_hash,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: new Date(row.created_at),
      lastActiveAt: new Date(row.last_active_at),
      expiresAt: new Date(row.expires_at),
      revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
    };
  }

  /** Map an ORM record (camelCase) to StoredSession. */
  private recordToSession(rec: SessionRecord): StoredSession {
    return {
      id: rec.id,
      userId: rec.userId,
      refreshTokenHash: rec.refreshTokenHash,
      previousRefreshHash: rec.previousRefreshHash,
      ipAddress: rec.ipAddress,
      userAgent: rec.userAgent,
      createdAt: new Date(rec.createdAt),
      lastActiveAt: new Date(rec.lastActiveAt),
      expiresAt: new Date(rec.expiresAt),
      revokedAt: rec.revokedAt ? new Date(rec.revokedAt) : null,
    };
  }
}
