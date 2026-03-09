/**
 * Shared test factory for SessionStore behavioral parity.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { SessionStore } from '../types';

export function sessionStoreTests(
  name: string,
  factory: () => Promise<{ store: SessionStore; cleanup: () => Promise<void> }>,
) {
  describe(`SessionStore: ${name}`, () => {
    let store: SessionStore;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const result = await factory();
      store = result.store;
      cleanup = result.cleanup;
    });

    afterEach(async () => {
      store.dispose();
      await cleanup();
    });

    it('creates a session with id and retrieves by refresh hash', async () => {
      const session = await store.createSessionWithId('sess-1', {
        userId: 'user-1',
        refreshTokenHash: 'hash-abc',
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent/1.0',
        expiresAt: new Date(Date.now() + 3600_000),
      });

      expect(session.id).toBe('sess-1');
      expect(session.userId).toBe('user-1');

      const found = await store.findByRefreshHash('hash-abc');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('sess-1');
    });

    it('returns null for non-existent refresh hash', async () => {
      const found = await store.findByRefreshHash('nonexistent');
      expect(found).toBeNull();
    });

    it('stores and retrieves current tokens', async () => {
      const tokens = { jwt: 'jwt-token', refreshToken: 'refresh-token' };
      await store.createSessionWithId('sess-2', {
        userId: 'user-1',
        refreshTokenHash: 'hash-def',
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent/1.0',
        expiresAt: new Date(Date.now() + 3600_000),
        currentTokens: tokens,
      });

      const retrieved = await store.getCurrentTokens('sess-2');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.jwt).toBe('jwt-token');
      expect(retrieved!.refreshToken).toBe('refresh-token');
    });

    it('returns null tokens for session without tokens', async () => {
      await store.createSessionWithId('sess-3', {
        userId: 'user-1',
        refreshTokenHash: 'hash-ghi',
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent/1.0',
        expiresAt: new Date(Date.now() + 3600_000),
      });

      const tokens = await store.getCurrentTokens('sess-3');
      expect(tokens).toBeNull();
    });

    it('revokes a session', async () => {
      await store.createSessionWithId('sess-4', {
        userId: 'user-1',
        refreshTokenHash: 'hash-jkl',
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent/1.0',
        expiresAt: new Date(Date.now() + 3600_000),
      });

      await store.revokeSession('sess-4');

      // Revoked sessions are not returned by findByRefreshHash
      const found = await store.findByRefreshHash('hash-jkl');
      expect(found).toBeNull();
    });

    it('lists active sessions for a user', async () => {
      await store.createSessionWithId('sess-5a', {
        userId: 'user-2',
        refreshTokenHash: 'hash-5a',
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent/1.0',
        expiresAt: new Date(Date.now() + 3600_000),
      });
      await store.createSessionWithId('sess-5b', {
        userId: 'user-2',
        refreshTokenHash: 'hash-5b',
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent/2.0',
        expiresAt: new Date(Date.now() + 3600_000),
      });
      // Another user
      await store.createSessionWithId('sess-5c', {
        userId: 'user-3',
        refreshTokenHash: 'hash-5c',
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent/3.0',
        expiresAt: new Date(Date.now() + 3600_000),
      });

      const sessions = await store.listActiveSessions('user-2');
      expect(sessions).toHaveLength(2);
    });

    it('counts active sessions', async () => {
      await store.createSessionWithId('sess-6a', {
        userId: 'user-4',
        refreshTokenHash: 'hash-6a',
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent/1.0',
        expiresAt: new Date(Date.now() + 3600_000),
      });

      const count = await store.countActiveSessions('user-4');
      expect(count).toBe(1);
    });

    it('updates session with new refresh hash and tokens', async () => {
      await store.createSessionWithId('sess-7', {
        userId: 'user-5',
        refreshTokenHash: 'hash-old',
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent/1.0',
        expiresAt: new Date(Date.now() + 3600_000),
      });

      await store.updateSession('sess-7', {
        refreshTokenHash: 'hash-new',
        previousRefreshHash: 'hash-old',
        lastActiveAt: new Date(),
        currentTokens: { jwt: 'new-jwt', refreshToken: 'new-refresh' },
      });

      // Old hash no longer works
      const byOldHash = await store.findByRefreshHash('hash-old');
      expect(byOldHash).toBeNull();

      // New hash works
      const byNewHash = await store.findByRefreshHash('hash-new');
      expect(byNewHash).not.toBeNull();
      expect(byNewHash!.id).toBe('sess-7');

      // Previous hash grace period
      const byPrevHash = await store.findByPreviousRefreshHash('hash-old');
      expect(byPrevHash).not.toBeNull();
      expect(byPrevHash!.id).toBe('sess-7');

      // Current tokens updated
      const tokens = await store.getCurrentTokens('sess-7');
      expect(tokens!.jwt).toBe('new-jwt');
    });

    it('does not return expired sessions', async () => {
      await store.createSessionWithId('sess-8', {
        userId: 'user-6',
        refreshTokenHash: 'hash-expired',
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent/1.0',
        expiresAt: new Date(Date.now() - 1000), // expired
      });

      const found = await store.findByRefreshHash('hash-expired');
      expect(found).toBeNull();

      const sessions = await store.listActiveSessions('user-6');
      expect(sessions).toHaveLength(0);
    });
  });
}
