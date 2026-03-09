/**
 * Shared test factory for OAuthAccountStore behavioral parity.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { OAuthAccountStore } from '../types';

export function oauthAccountStoreTests(
  name: string,
  factory: () => Promise<{ store: OAuthAccountStore; cleanup: () => Promise<void> }>,
) {
  describe(`OAuthAccountStore: ${name}`, () => {
    let store: OAuthAccountStore;
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

    it('links an account and finds by provider account', async () => {
      await store.linkAccount('user-1', 'github', 'gh-123', 'user@example.com');
      const userId = await store.findByProviderAccount('github', 'gh-123');
      expect(userId).toBe('user-1');
    });

    it('returns null for unknown provider account', async () => {
      const userId = await store.findByProviderAccount('github', 'unknown');
      expect(userId).toBeNull();
    });

    it('finds linked accounts by user id', async () => {
      await store.linkAccount('user-1', 'github', 'gh-123');
      await store.linkAccount('user-1', 'google', 'goog-456');

      const accounts = await store.findByUserId('user-1');
      expect(accounts).toHaveLength(2);
      expect(accounts.some((a) => a.provider === 'github' && a.providerId === 'gh-123')).toBe(true);
      expect(accounts.some((a) => a.provider === 'google' && a.providerId === 'goog-456')).toBe(
        true,
      );
    });

    it('returns empty array for user with no linked accounts', async () => {
      const accounts = await store.findByUserId('user-unknown');
      expect(accounts).toHaveLength(0);
    });

    it('unlinks an account by provider', async () => {
      await store.linkAccount('user-1', 'github', 'gh-123');
      await store.linkAccount('user-1', 'google', 'goog-456');

      await store.unlinkAccount('user-1', 'github');

      const userId = await store.findByProviderAccount('github', 'gh-123');
      expect(userId).toBeNull();

      const accounts = await store.findByUserId('user-1');
      expect(accounts).toHaveLength(1);
      expect(accounts[0]!.provider).toBe('google');
    });

    it('linkAccount is idempotent for same provider+providerId', async () => {
      await store.linkAccount('user-1', 'github', 'gh-123', 'user@example.com');
      await store.linkAccount('user-1', 'github', 'gh-123', 'user@example.com');

      const accounts = await store.findByUserId('user-1');
      expect(accounts).toHaveLength(1);
    });

    it('unlink is a no-op for non-linked provider', async () => {
      await store.linkAccount('user-1', 'github', 'gh-123');
      // Should not throw
      await store.unlinkAccount('user-1', 'google');

      const accounts = await store.findByUserId('user-1');
      expect(accounts).toHaveLength(1);
    });
  });
}
