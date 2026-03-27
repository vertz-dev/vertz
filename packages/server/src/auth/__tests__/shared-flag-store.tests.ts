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
      store.setFlag('tenant', 'org-1', 'beta_feature', true);
      expect(store.getFlag('tenant', 'org-1', 'beta_feature')).toBe(true);
    });

    it('returns false for unset flag', () => {
      expect(store.getFlag('tenant', 'org-1', 'nonexistent')).toBe(false);
    });

    it('overrides a flag value', () => {
      store.setFlag('tenant', 'org-1', 'feature_a', true);
      store.setFlag('tenant', 'org-1', 'feature_a', false);
      expect(store.getFlag('tenant', 'org-1', 'feature_a')).toBe(false);
    });

    it('gets all flags for a resource', () => {
      store.setFlag('tenant', 'org-1', 'feat_a', true);
      store.setFlag('tenant', 'org-1', 'feat_b', false);
      const flags = store.getFlags('tenant', 'org-1');
      expect(flags.feat_a).toBe(true);
      expect(flags.feat_b).toBe(false);
    });

    it('returns empty object for resource with no flags', () => {
      const flags = store.getFlags('tenant', 'org-99');
      expect(Object.keys(flags)).toHaveLength(0);
    });

    it('isolates flags between resources of same type', () => {
      store.setFlag('tenant', 'org-1', 'shared_flag', true);
      store.setFlag('tenant', 'org-2', 'shared_flag', false);
      expect(store.getFlag('tenant', 'org-1', 'shared_flag')).toBe(true);
      expect(store.getFlag('tenant', 'org-2', 'shared_flag')).toBe(false);
    });

    it('isolates flags between different resource types with same ID', () => {
      store.setFlag('account', 'id-1', 'beta_ai', true);
      store.setFlag('project', 'id-1', 'beta_ai', false);
      expect(store.getFlag('account', 'id-1', 'beta_ai')).toBe(true);
      expect(store.getFlag('project', 'id-1', 'beta_ai')).toBe(false);
    });
  });
}
