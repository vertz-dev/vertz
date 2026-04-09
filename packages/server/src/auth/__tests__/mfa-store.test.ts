import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import { InMemoryMFAStore } from '../mfa-store';

describe('InMemoryMFAStore', () => {
  let store: InMemoryMFAStore;

  beforeEach(() => {
    store = new InMemoryMFAStore();
  });

  afterEach(() => {
    store.dispose();
  });

  it('enableMfa stores encrypted secret', async () => {
    await store.enableMfa('user-1', 'encrypted-secret-abc');
    const secret = await store.getSecret('user-1');
    expect(secret).toBe('encrypted-secret-abc');
  });

  it('getSecret returns stored secret', async () => {
    await store.enableMfa('user-1', 'my-secret');
    expect(await store.getSecret('user-1')).toBe('my-secret');
  });

  it('getSecret returns null for unknown user', async () => {
    expect(await store.getSecret('unknown')).toBeNull();
  });

  it('isMfaEnabled returns true/false correctly', async () => {
    expect(await store.isMfaEnabled('user-1')).toBe(false);
    await store.enableMfa('user-1', 'secret');
    expect(await store.isMfaEnabled('user-1')).toBe(true);
  });

  it('disableMfa removes secret and backup codes', async () => {
    await store.enableMfa('user-1', 'secret');
    await store.setBackupCodes('user-1', ['hash1', 'hash2']);
    await store.disableMfa('user-1');
    expect(await store.isMfaEnabled('user-1')).toBe(false);
    expect(await store.getSecret('user-1')).toBeNull();
    expect(await store.getBackupCodes('user-1')).toEqual([]);
  });

  it('setBackupCodes stores hashed codes', async () => {
    await store.setBackupCodes('user-1', ['hash-a', 'hash-b', 'hash-c']);
    const codes = await store.getBackupCodes('user-1');
    expect(codes).toEqual(['hash-a', 'hash-b', 'hash-c']);
  });

  it('getBackupCodes returns empty array for unknown user', async () => {
    expect(await store.getBackupCodes('unknown')).toEqual([]);
  });

  it('consumeBackupCode removes the used code', async () => {
    await store.setBackupCodes('user-1', ['hash-a', 'hash-b', 'hash-c']);
    await store.consumeBackupCode('user-1', 'hash-b');
    const remaining = await store.getBackupCodes('user-1');
    expect(remaining).toEqual(['hash-a', 'hash-c']);
  });

  it('dispose clears all data', async () => {
    await store.enableMfa('user-1', 'secret');
    await store.setBackupCodes('user-1', ['hash-a']);
    store.dispose();
    expect(await store.isMfaEnabled('user-1')).toBe(false);
    expect(await store.getSecret('user-1')).toBeNull();
    expect(await store.getBackupCodes('user-1')).toEqual([]);
  });
});
