import { describe, expect, it } from '@vertz/test';
import { InMemoryOAuthAccountStore } from '../oauth-account-store';

describe('InMemoryOAuthAccountStore', () => {
  it('linkAccount stores a provider link', async () => {
    const store = new InMemoryOAuthAccountStore();
    await store.linkAccount('user-1', 'google', 'goog-123', 'user@example.com');
    const userId = await store.findByProviderAccount('google', 'goog-123');
    expect(userId).toBe('user-1');
  });

  it('findByProviderAccount returns null for unknown link', async () => {
    const store = new InMemoryOAuthAccountStore();
    const userId = await store.findByProviderAccount('google', 'unknown');
    expect(userId).toBeNull();
  });

  it('findByUserId returns all links for a user', async () => {
    const store = new InMemoryOAuthAccountStore();
    await store.linkAccount('user-1', 'google', 'goog-123');
    await store.linkAccount('user-1', 'github', 'gh-456');
    const links = await store.findByUserId('user-1');
    expect(links).toHaveLength(2);
    expect(links).toContainEqual({ provider: 'google', providerId: 'goog-123' });
    expect(links).toContainEqual({ provider: 'github', providerId: 'gh-456' });
  });

  it('unlinkAccount removes a specific link', async () => {
    const store = new InMemoryOAuthAccountStore();
    await store.linkAccount('user-1', 'google', 'goog-123');
    await store.linkAccount('user-1', 'github', 'gh-456');
    await store.unlinkAccount('user-1', 'google');
    const links = await store.findByUserId('user-1');
    expect(links).toHaveLength(1);
    expect(links[0].provider).toBe('github');
    const googleResult = await store.findByProviderAccount('google', 'goog-123');
    expect(googleResult).toBeNull();
  });

  it('dispose is safe to call', () => {
    const store = new InMemoryOAuthAccountStore();
    expect(() => store.dispose()).not.toThrow();
  });
});
