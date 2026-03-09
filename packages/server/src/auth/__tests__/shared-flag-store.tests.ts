/**
 * Shared test factory for FlagStore behavioral parity.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { FlagStore } from '../flag-store';

export function flagStoreTests(
  name: string,
  factory: () => Promise<{ store: FlagStore; cleanup: () => Promise<void> }>,
) {
  describe(`FlagStore: ${name}`, () => {
    let store: FlagStore;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const result = await factory();
      store = result.store;
      cleanup = result.cleanup;
    });

    afterEach(async () => {
      await cleanup();
    });

    it('sets and gets a flag', () => {
      store.setFlag('org-1', 'beta_feature', true);
      expect(store.getFlag('org-1', 'beta_feature')).toBe(true);
    });

    it('returns false for unset flag', () => {
      expect(store.getFlag('org-1', 'nonexistent')).toBe(false);
    });

    it('overrides a flag value', () => {
      store.setFlag('org-1', 'feature_a', true);
      store.setFlag('org-1', 'feature_a', false);
      expect(store.getFlag('org-1', 'feature_a')).toBe(false);
    });

    it('gets all flags for an org', () => {
      store.setFlag('org-1', 'feat_a', true);
      store.setFlag('org-1', 'feat_b', false);
      const flags = store.getFlags('org-1');
      expect(flags.feat_a).toBe(true);
      expect(flags.feat_b).toBe(false);
    });

    it('returns empty object for org with no flags', () => {
      const flags = store.getFlags('org-99');
      expect(Object.keys(flags)).toHaveLength(0);
    });

    it('isolates flags between orgs', () => {
      store.setFlag('org-1', 'shared_flag', true);
      store.setFlag('org-2', 'shared_flag', false);
      expect(store.getFlag('org-1', 'shared_flag')).toBe(true);
      expect(store.getFlag('org-2', 'shared_flag')).toBe(false);
    });
  });
}
