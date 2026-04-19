import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
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

  it('dispose is idempotent', () => {
    const s = new InMemorySessionStore();
    s.dispose();
    s.dispose();
  });

  it('does not schedule a setInterval at construction time', () => {
    // Regression for #2851 — a background setInterval in the constructor keeps
    // the V8 event loop alive and prevents the API isolate from completing
    // module evaluation, making `createServer({ auth })` hang.
    const originalSetInterval = globalThis.setInterval;
    let scheduled = false;
    globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => {
      scheduled = true;
      return originalSetInterval(...args);
    }) as typeof setInterval;
    try {
      const s = new InMemorySessionStore();
      expect(scheduled).toBe(false);
      s.dispose();
    } finally {
      globalThis.setInterval = originalSetInterval;
    }
  });

  it('createSessionWithId uses the provided id', async () => {
    const session = await store.createSessionWithId('custom-id-123', {
      userId: 'user-1',
      refreshTokenHash: 'hash-custom',
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent/1.0',
      expiresAt: new Date(Date.now() + 86400000),
    });

    expect(session.id).toBe('custom-id-123');
    expect(session.userId).toBe('user-1');
  });

  it('createSessionWithId stores currentTokens when provided', async () => {
    const tokens = { jwt: 'test-jwt', refreshToken: 'test-refresh' };
    await store.createSessionWithId('tokens-id', {
      userId: 'user-1',
      refreshTokenHash: 'hash-tokens',
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent/1.0',
      expiresAt: new Date(Date.now() + 86400000),
      currentTokens: tokens,
    });

    const retrieved = await store.getCurrentTokens('tokens-id');
    expect(retrieved).toEqual(tokens);
  });

  it('getCurrentTokens returns null for unknown session', async () => {
    const result = await store.getCurrentTokens('nonexistent');
    expect(result).toBeNull();
  });

  it('findByPreviousRefreshHash returns session with matching previous hash', async () => {
    const session = await store.createSession({
      userId: 'user-prev',
      refreshTokenHash: 'hash-current',
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent/1.0',
      expiresAt: new Date(Date.now() + 86400000),
    });

    await store.updateSession(session.id, {
      refreshTokenHash: 'hash-new',
      previousRefreshHash: 'hash-current',
      lastActiveAt: new Date(),
    });

    const found = await store.findByPreviousRefreshHash('hash-current');
    expect(found).not.toBeNull();
    expect(found?.id).toBe(session.id);
  });

  it('findByPreviousRefreshHash returns null when no match', async () => {
    const found = await store.findByPreviousRefreshHash('nonexistent');
    expect(found).toBeNull();
  });

  it('updateSession updates refresh hash and lastActiveAt', async () => {
    const session = await store.createSession({
      userId: 'user-update',
      refreshTokenHash: 'hash-old',
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent/1.0',
      expiresAt: new Date(Date.now() + 86400000),
    });

    const newDate = new Date();
    await store.updateSession(session.id, {
      refreshTokenHash: 'hash-rotated',
      previousRefreshHash: 'hash-old',
      lastActiveAt: newDate,
    });

    // Old hash should no longer find the session
    const oldFound = await store.findByRefreshHash('hash-old');
    expect(oldFound).toBeNull();

    // New hash should find it
    const newFound = await store.findByRefreshHash('hash-rotated');
    expect(newFound).not.toBeNull();
    expect(newFound?.id).toBe(session.id);
  });

  it('updateSession stores currentTokens when provided', async () => {
    const session = await store.createSession({
      userId: 'user-tokens',
      refreshTokenHash: 'hash-tok',
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent/1.0',
      expiresAt: new Date(Date.now() + 86400000),
    });

    const tokens = { jwt: 'updated-jwt', refreshToken: 'updated-refresh' };
    await store.updateSession(session.id, {
      refreshTokenHash: 'hash-tok-new',
      previousRefreshHash: 'hash-tok',
      lastActiveAt: new Date(),
      currentTokens: tokens,
    });

    const retrieved = await store.getCurrentTokens(session.id);
    expect(retrieved).toEqual(tokens);
  });

  it('revokeSession clears currentTokens', async () => {
    const tokens = { jwt: 'jwt-to-clear', refreshToken: 'ref-to-clear' };
    await store.createSessionWithId('revoke-tokens-id', {
      userId: 'user-1',
      refreshTokenHash: 'hash-rt',
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent/1.0',
      expiresAt: new Date(Date.now() + 86400000),
      currentTokens: tokens,
    });

    await store.revokeSession('revoke-tokens-id');
    const retrieved = await store.getCurrentTokens('revoke-tokens-id');
    expect(retrieved).toBeNull();
  });

  it('enforces max sessions per user by revoking oldest', async () => {
    const limitedStore = new InMemorySessionStore(2);

    await limitedStore.createSession({
      userId: 'user-max',
      refreshTokenHash: 'hash-oldest',
      ipAddress: '127.0.0.1',
      userAgent: 'Agent1',
      expiresAt: new Date(Date.now() + 86400000),
    });

    await limitedStore.createSession({
      userId: 'user-max',
      refreshTokenHash: 'hash-middle',
      ipAddress: '127.0.0.1',
      userAgent: 'Agent2',
      expiresAt: new Date(Date.now() + 86400000),
    });

    // Third session should trigger revocation of oldest
    await limitedStore.createSession({
      userId: 'user-max',
      refreshTokenHash: 'hash-newest',
      ipAddress: '127.0.0.1',
      userAgent: 'Agent3',
      expiresAt: new Date(Date.now() + 86400000),
    });

    const sessions = await limitedStore.listActiveSessions('user-max');
    expect(sessions).toHaveLength(2);

    // Oldest should be revoked
    const oldest = await limitedStore.findByRefreshHash('hash-oldest');
    expect(oldest).toBeNull();

    limitedStore.dispose();
  });
});
