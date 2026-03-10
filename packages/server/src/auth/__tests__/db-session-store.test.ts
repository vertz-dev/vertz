import { describe, expect, it } from 'bun:test';
import { DbSessionStore } from '../db-session-store';
import type { AuthDbClient } from '../db-types';
import { InMemorySessionStore } from '../session-store';
import { sessionStoreTests } from './shared-session-store.tests';
import { createTestDb } from './test-db-helper';

// Run shared tests against InMemorySessionStore
sessionStoreTests('InMemory', async () => ({
  store: new InMemorySessionStore(),
  cleanup: async () => {},
}));

// Run shared tests against DbSessionStore (SQLite)
sessionStoreTests('SQLite', async () => {
  const testDb = await createTestDb();
  return {
    store: new DbSessionStore(testDb.db),
    cleanup: testDb.cleanup,
  };
});

describe('DbSessionStore.findActiveSessionById', () => {
  it('returns an active session from the typed auth_sessions delegate', async () => {
    const db = {
      auth_sessions: {
        get: async () => ({
          ok: true,
          data: {
            id: 'session-active',
            userId: 'user-1',
            refreshTokenHash: 'refresh-hash',
            previousRefreshHash: null,
            currentTokens: null,
            ipAddress: '127.0.0.1',
            userAgent: 'bun:test',
            createdAt: '2026-03-10T00:00:00.000Z',
            lastActiveAt: '2026-03-10T00:00:01.000Z',
            expiresAt: '2026-03-10T00:01:00.000Z',
            revokedAt: null,
          },
        }),
      },
    } as unknown as AuthDbClient;

    const store = new DbSessionStore(db);
    const session = await store.findActiveSessionById('session-active');

    expect(session).not.toBeNull();
    expect(session?.id).toBe('session-active');
    expect(session?.userId).toBe('user-1');
    expect(session?.ipAddress).toBe('127.0.0.1');
    expect(session?.userAgent).toBe('bun:test');
    expect(session?.createdAt).toBeInstanceOf(Date);
    expect(session?.lastActiveAt).toBeInstanceOf(Date);
    expect(session?.expiresAt).toBeInstanceOf(Date);
    expect(session?.revokedAt).toBeNull();
  });

  it('returns null when the typed auth_sessions delegate finds no active row', async () => {
    const db = {
      auth_sessions: {
        get: async () => ({ ok: true, data: null }),
      },
    } as unknown as AuthDbClient;

    const store = new DbSessionStore(db);

    await expect(store.findActiveSessionById('missing-session')).resolves.toBeNull();
  });

  it('returns null when the typed auth_sessions delegate errors', async () => {
    const db = {
      auth_sessions: {
        get: async () => ({
          ok: false,
          error: { message: 'delegate failed' },
        }),
      },
    } as unknown as AuthDbClient;

    const store = new DbSessionStore(db);

    await expect(store.findActiveSessionById('broken-session')).resolves.toBeNull();
  });

  it('returns null for revoked or expired sessions', async () => {
    const testDb = await createTestDb();
    try {
      const store = new DbSessionStore(testDb.db);

      await store.createSessionWithId('session-revoked', {
        userId: 'user-1',
        refreshTokenHash: 'refresh-revoked',
        ipAddress: '127.0.0.1',
        userAgent: 'bun:test',
        expiresAt: new Date(Date.now() + 60_000),
      });
      await store.revokeSession('session-revoked');

      await store.createSessionWithId('session-expired', {
        userId: 'user-1',
        refreshTokenHash: 'refresh-expired',
        ipAddress: '127.0.0.1',
        userAgent: 'bun:test',
        expiresAt: new Date(Date.now() - 60_000),
      });

      await expect(store.findActiveSessionById('session-revoked')).resolves.toBeNull();
      await expect(store.findActiveSessionById('session-expired')).resolves.toBeNull();
    } finally {
      await testDb.cleanup();
    }
  });
});
