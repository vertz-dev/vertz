import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import { InMemoryPasswordResetStore } from '../password-reset-store';

describe('InMemoryPasswordResetStore', () => {
  let store: InMemoryPasswordResetStore;

  beforeEach(() => {
    store = new InMemoryPasswordResetStore();
  });

  afterEach(() => {
    store.dispose();
  });

  it('creates a reset and returns it with generated id', async () => {
    const reset = await store.createReset({
      userId: 'user-1',
      tokenHash: 'hash-abc',
      expiresAt: new Date(Date.now() + 3600_000),
    });
    expect(reset.id).toBeDefined();
    expect(reset.userId).toBe('user-1');
    expect(reset.tokenHash).toBe('hash-abc');
    expect(reset.createdAt).toBeInstanceOf(Date);
  });

  it('finds reset by token hash', async () => {
    await store.createReset({
      userId: 'user-1',
      tokenHash: 'hash-abc',
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const found = await store.findByTokenHash('hash-abc');
    expect(found).not.toBeNull();
    expect(found!.userId).toBe('user-1');
  });

  it('returns null for unknown token hash', async () => {
    const found = await store.findByTokenHash('nonexistent');
    expect(found).toBeNull();
  });

  it('deletes all resets by userId', async () => {
    await store.createReset({
      userId: 'user-1',
      tokenHash: 'hash-1',
      expiresAt: new Date(Date.now() + 3600_000),
    });
    await store.createReset({
      userId: 'user-1',
      tokenHash: 'hash-2',
      expiresAt: new Date(Date.now() + 3600_000),
    });
    await store.deleteByUserId('user-1');
    expect(await store.findByTokenHash('hash-1')).toBeNull();
    expect(await store.findByTokenHash('hash-2')).toBeNull();
  });

  it('dispose clears all data', async () => {
    await store.createReset({
      userId: 'user-1',
      tokenHash: 'hash-abc',
      expiresAt: new Date(Date.now() + 3600_000),
    });
    store.dispose();
    expect(await store.findByTokenHash('hash-abc')).toBeNull();
  });
});
