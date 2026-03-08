import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { InMemorySessionStore } from '../session-store';

describe('InMemorySessionStore', () => {
  let store: InMemorySessionStore;

  beforeEach(() => {
    store = new InMemorySessionStore();
  });

  afterEach(() => {
    store.dispose();
  });

  it('creates a session and returns session info', async () => {
    const session = await store.createSession({
      userId: 'user-1',
      refreshTokenHash: 'hash-abc',
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent/1.0',
      expiresAt: new Date(Date.now() + 86400000),
    });

    expect(session.id).toBeDefined();
    expect(session.userId).toBe('user-1');
    expect(session.refreshTokenHash).toBe('hash-abc');
    expect(session.ipAddress).toBe('127.0.0.1');
    expect(session.userAgent).toBe('TestAgent/1.0');
    expect(session.previousRefreshHash).toBeNull();
    expect(session.revokedAt).toBeNull();
    expect(session.createdAt).toBeInstanceOf(Date);
    expect(session.lastActiveAt).toBeInstanceOf(Date);
  });

  it('finds a session by refresh token hash', async () => {
    const created = await store.createSession({
      userId: 'user-1',
      refreshTokenHash: 'hash-find-me',
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent/1.0',
      expiresAt: new Date(Date.now() + 86400000),
    });

    const found = await store.findByRefreshHash('hash-find-me');
    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
  });

  it('revokes a session by id', async () => {
    const session = await store.createSession({
      userId: 'user-1',
      refreshTokenHash: 'hash-revoke',
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent/1.0',
      expiresAt: new Date(Date.now() + 86400000),
    });

    await store.revokeSession(session.id);

    const found = await store.findByRefreshHash('hash-revoke');
    expect(found).toBeNull();
  });

  it('lists active sessions for a user', async () => {
    await store.createSession({
      userId: 'user-list',
      refreshTokenHash: 'hash-1',
      ipAddress: '127.0.0.1',
      userAgent: 'Agent1',
      expiresAt: new Date(Date.now() + 86400000),
    });
    await store.createSession({
      userId: 'user-list',
      refreshTokenHash: 'hash-2',
      ipAddress: '127.0.0.2',
      userAgent: 'Agent2',
      expiresAt: new Date(Date.now() + 86400000),
    });
    await store.createSession({
      userId: 'other-user',
      refreshTokenHash: 'hash-3',
      ipAddress: '127.0.0.3',
      userAgent: 'Agent3',
      expiresAt: new Date(Date.now() + 86400000),
    });

    const sessions = await store.listActiveSessions('user-list');
    expect(sessions).toHaveLength(2);
  });

  it('counts active sessions for a user', async () => {
    await store.createSession({
      userId: 'user-count',
      refreshTokenHash: 'hash-c1',
      ipAddress: '127.0.0.1',
      userAgent: 'Agent1',
      expiresAt: new Date(Date.now() + 86400000),
    });
    await store.createSession({
      userId: 'user-count',
      refreshTokenHash: 'hash-c2',
      ipAddress: '127.0.0.2',
      userAgent: 'Agent2',
      expiresAt: new Date(Date.now() + 86400000),
    });

    const count = await store.countActiveSessions('user-count');
    expect(count).toBe(2);
  });

  it('does not return revoked sessions', async () => {
    const session = await store.createSession({
      userId: 'user-revoked',
      refreshTokenHash: 'hash-rev',
      ipAddress: '127.0.0.1',
      userAgent: 'Agent',
      expiresAt: new Date(Date.now() + 86400000),
    });

    await store.revokeSession(session.id);

    const sessions = await store.listActiveSessions('user-revoked');
    expect(sessions).toHaveLength(0);
  });

  it('does not return expired sessions', async () => {
    await store.createSession({
      userId: 'user-expired',
      refreshTokenHash: 'hash-exp',
      ipAddress: '127.0.0.1',
      userAgent: 'Agent',
      expiresAt: new Date(Date.now() - 1000), // Already expired
    });

    const sessions = await store.listActiveSessions('user-expired');
    expect(sessions).toHaveLength(0);
  });

  it('disposes cleanup interval', () => {
    const s = new InMemorySessionStore();
    // Should not throw
    s.dispose();
    s.dispose(); // Double dispose should also be safe
  });
});
