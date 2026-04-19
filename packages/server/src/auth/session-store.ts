/**
 * Session Store — pluggable session storage for auth module
 */

import { timingSafeEqual } from './crypto';
import type { AuthTokens, SessionStore, StoredSession } from './types';

const DEFAULT_MAX_SESSIONS_PER_USER = 50;
const CLEANUP_INTERVAL_MS = 60_000;

export class InMemorySessionStore implements SessionStore {
  private sessions = new Map<string, StoredSession>();
  private currentTokens = new Map<string, AuthTokens>();
  private lastCleanupAt = 0;
  private maxSessionsPerUser: number;

  constructor(maxSessionsPerUser: number = DEFAULT_MAX_SESSIONS_PER_USER) {
    this.maxSessionsPerUser = maxSessionsPerUser;
  }

  async createSession(data: {
    userId: string;
    refreshTokenHash: string;
    ipAddress: string;
    userAgent: string;
    expiresAt: Date;
  }): Promise<StoredSession> {
    this.maybeCleanup(new Date());
    // Enforce max sessions per user — revoke oldest on overflow
    const activeSessions = await this.listActiveSessions(data.userId);
    if (activeSessions.length >= this.maxSessionsPerUser) {
      // Sort by createdAt ascending — revoke the oldest
      const sorted = activeSessions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const toRevoke = sorted.slice(0, activeSessions.length - this.maxSessionsPerUser + 1);
      for (const s of toRevoke) {
        await this.revokeSession(s.id);
      }
    }

    const now = new Date();
    const session: StoredSession = {
      id: crypto.randomUUID(),
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

    this.sessions.set(session.id, session);
    return session;
  }

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
    this.maybeCleanup(new Date());
    // Enforce max sessions per user — revoke oldest on overflow
    const activeSessions = await this.listActiveSessions(data.userId);
    if (activeSessions.length >= this.maxSessionsPerUser) {
      const sorted = activeSessions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const toRevoke = sorted.slice(0, activeSessions.length - this.maxSessionsPerUser + 1);
      for (const s of toRevoke) {
        await this.revokeSession(s.id);
      }
    }

    const now = new Date();
    const session: StoredSession = {
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

    this.sessions.set(session.id, session);
    if (data.currentTokens) {
      this.currentTokens.set(id, data.currentTokens);
    }
    return session;
  }

  async findByRefreshHash(hash: string): Promise<StoredSession | null> {
    for (const session of this.sessions.values()) {
      if (
        timingSafeEqual(session.refreshTokenHash, hash) &&
        !session.revokedAt &&
        session.expiresAt > new Date()
      ) {
        return session;
      }
    }
    return null;
  }

  async findActiveSessionById(id: string): Promise<StoredSession | null> {
    const session = this.sessions.get(id);
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      return null;
    }
    return session;
  }

  async findByPreviousRefreshHash(hash: string): Promise<StoredSession | null> {
    for (const session of this.sessions.values()) {
      if (
        session.previousRefreshHash !== null &&
        timingSafeEqual(session.previousRefreshHash, hash) &&
        !session.revokedAt &&
        session.expiresAt > new Date()
      ) {
        return session;
      }
    }
    return null;
  }

  async revokeSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      session.revokedAt = new Date();
      this.currentTokens.delete(id);
    }
  }

  async listActiveSessions(userId: string): Promise<StoredSession[]> {
    const now = new Date();
    const result: StoredSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.userId === userId && !session.revokedAt && session.expiresAt > now) {
        result.push(session);
      }
    }
    return result;
  }

  async countActiveSessions(userId: string): Promise<number> {
    const sessions = await this.listActiveSessions(userId);
    return sessions.length;
  }

  async getCurrentTokens(sessionId: string): Promise<AuthTokens | null> {
    return this.currentTokens.get(sessionId) ?? null;
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
    const session = this.sessions.get(id);
    if (session) {
      session.refreshTokenHash = data.refreshTokenHash;
      session.previousRefreshHash = data.previousRefreshHash;
      session.lastActiveAt = data.lastActiveAt;
      if (data.currentTokens) {
        this.currentTokens.set(id, data.currentTokens);
      }
    }
  }

  dispose(): void {
    this.sessions.clear();
    this.currentTokens.clear();
  }

  private maybeCleanup(now: Date): void {
    const nowMs = now.getTime();
    if (nowMs - this.lastCleanupAt < CLEANUP_INTERVAL_MS) return;
    this.lastCleanupAt = nowMs;
    this.cleanup(now);
  }

  private cleanup(now: Date = new Date()): void {
    for (const [id, session] of this.sessions) {
      if (session.expiresAt < now || session.revokedAt) {
        this.sessions.delete(id);
        this.currentTokens.delete(id);
      }
    }
  }
}
