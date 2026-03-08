import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { InMemoryEmailVerificationStore } from '../email-verification-store';

describe('InMemoryEmailVerificationStore', () => {
  let store: InMemoryEmailVerificationStore;

  beforeEach(() => {
    store = new InMemoryEmailVerificationStore();
  });

  afterEach(() => {
    store.dispose();
  });

  it('creates a verification and returns it with generated id', async () => {
    const verification = await store.createVerification({
      userId: 'user-1',
      tokenHash: 'hash-abc',
      expiresAt: new Date(Date.now() + 86400_000),
    });
    expect(verification.id).toBeDefined();
    expect(verification.userId).toBe('user-1');
    expect(verification.tokenHash).toBe('hash-abc');
    expect(verification.createdAt).toBeInstanceOf(Date);
  });

  it('finds verification by token hash', async () => {
    await store.createVerification({
      userId: 'user-1',
      tokenHash: 'hash-abc',
      expiresAt: new Date(Date.now() + 86400_000),
    });
    const found = await store.findByTokenHash('hash-abc');
    expect(found).not.toBeNull();
    expect(found!.userId).toBe('user-1');
  });

  it('returns null for unknown token hash', async () => {
    const found = await store.findByTokenHash('nonexistent');
    expect(found).toBeNull();
  });

  it('deletes all verifications by userId', async () => {
    await store.createVerification({
      userId: 'user-1',
      tokenHash: 'hash-1',
      expiresAt: new Date(Date.now() + 86400_000),
    });
    await store.createVerification({
      userId: 'user-1',
      tokenHash: 'hash-2',
      expiresAt: new Date(Date.now() + 86400_000),
    });
    await store.deleteByUserId('user-1');
    expect(await store.findByTokenHash('hash-1')).toBeNull();
    expect(await store.findByTokenHash('hash-2')).toBeNull();
  });

  it('deletes verification by token hash', async () => {
    await store.createVerification({
      userId: 'user-1',
      tokenHash: 'hash-abc',
      expiresAt: new Date(Date.now() + 86400_000),
    });
    await store.deleteByTokenHash('hash-abc');
    expect(await store.findByTokenHash('hash-abc')).toBeNull();
  });

  it('dispose clears all data', async () => {
    await store.createVerification({
      userId: 'user-1',
      tokenHash: 'hash-abc',
      expiresAt: new Date(Date.now() + 86400_000),
    });
    store.dispose();
    expect(await store.findByTokenHash('hash-abc')).toBeNull();
  });
});
