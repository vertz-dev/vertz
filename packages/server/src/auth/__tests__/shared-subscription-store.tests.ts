/**
 * Shared test factory for SubscriptionStore behavioral parity.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { SubscriptionStore } from '../subscription-store';

export function subscriptionStoreTests(
  name: string,
  factory: () => Promise<{ store: SubscriptionStore; cleanup: () => Promise<void> }>,
) {
  describe(`SubscriptionStore: ${name}`, () => {
    let store: SubscriptionStore;
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

    it('assigns a subscription and retrieves it', async () => {
      await store.assign('tenant-1', 'free');

      const sub = await store.get('tenant-1');
      expect(sub).not.toBeNull();
      expect(sub!.tenantId).toBe('tenant-1');
      expect(sub!.planId).toBe('free');
      expect(sub!.startedAt).toBeInstanceOf(Date);
      expect(sub!.expiresAt).toBeNull();
      expect(sub!.overrides).toEqual({});
    });

    it('returns null for unknown tenant', async () => {
      expect(await store.get('tenant-unknown')).toBeNull();
    });

    it('accepts custom startedAt and expiresAt', async () => {
      const startedAt = new Date('2026-01-01T00:00:00Z');
      const expiresAt = new Date('2026-12-31T23:59:59Z');
      await store.assign('tenant-1', 'pro', startedAt, expiresAt);

      const sub = await store.get('tenant-1');
      expect(sub!.startedAt.getTime()).toBe(startedAt.getTime());
      expect(sub!.expiresAt!.getTime()).toBe(expiresAt.getTime());
    });

    it('overwrites existing subscription for same tenant', async () => {
      await store.assign('tenant-1', 'free');
      await store.assign('tenant-1', 'pro');

      const sub = await store.get('tenant-1');
      expect(sub!.planId).toBe('pro');
    });

    it('assign resets overrides', async () => {
      await store.assign('tenant-1', 'free');
      await store.updateOverrides('tenant-1', {
        'project:create': { max: 200 },
      });
      // Re-assign — overrides should reset
      await store.assign('tenant-1', 'pro');

      const sub = await store.get('tenant-1');
      expect(sub!.overrides).toEqual({});
    });

    it('updateOverrides merges overrides into existing subscription', async () => {
      await store.assign('tenant-1', 'free');
      await store.updateOverrides('tenant-1', {
        'project:create': { max: 200 },
      });

      const sub = await store.get('tenant-1');
      expect(sub!.overrides).toEqual({
        'project:create': { max: 200 },
      });
    });

    it('updateOverrides merges with existing overrides', async () => {
      await store.assign('tenant-1', 'free');
      await store.updateOverrides('tenant-1', {
        'project:create': { max: 200 },
      });
      await store.updateOverrides('tenant-1', {
        'api:call': { max: 5000 },
      });

      const sub = await store.get('tenant-1');
      expect(sub!.overrides).toEqual({
        'project:create': { max: 200 },
        'api:call': { max: 5000 },
      });
    });

    it('updateOverrides is a no-op for unknown tenant', async () => {
      await store.updateOverrides('tenant-unknown', {
        'project:create': { max: 200 },
      });
      expect(await store.get('tenant-unknown')).toBeNull();
    });

    it('remove clears subscription', async () => {
      await store.assign('tenant-1', 'free');
      await store.remove('tenant-1');
      expect(await store.get('tenant-1')).toBeNull();
    });

    it('remove also clears overrides', async () => {
      await store.assign('tenant-1', 'free');
      await store.updateOverrides('tenant-1', {
        'project:create': { max: 200 },
      });
      await store.remove('tenant-1');

      // Re-assign and check overrides are gone
      await store.assign('tenant-1', 'pro');
      const sub = await store.get('tenant-1');
      expect(sub!.overrides).toEqual({});
    });

    // Add-on tests (optional methods — skip if not implemented)
    it('attachAddOn and getAddOns', async () => {
      if (!store.attachAddOn || !store.getAddOns) return;

      await store.attachAddOn('tenant-1', 'addon-a');
      await store.attachAddOn('tenant-1', 'addon-b');

      const addOns = await store.getAddOns('tenant-1');
      expect(addOns).toContain('addon-a');
      expect(addOns).toContain('addon-b');
      expect(addOns).toHaveLength(2);
    });

    it('attachAddOn is idempotent', async () => {
      if (!store.attachAddOn || !store.getAddOns) return;

      await store.attachAddOn('tenant-1', 'addon-a');
      await store.attachAddOn('tenant-1', 'addon-a');

      const addOns = await store.getAddOns('tenant-1');
      expect(addOns.filter((a) => a === 'addon-a')).toHaveLength(1);
    });

    it('detachAddOn removes an add-on', async () => {
      if (!store.attachAddOn || !store.detachAddOn || !store.getAddOns) return;

      await store.attachAddOn('tenant-1', 'addon-a');
      await store.attachAddOn('tenant-1', 'addon-b');
      await store.detachAddOn('tenant-1', 'addon-a');

      const addOns = await store.getAddOns('tenant-1');
      expect(addOns).toEqual(['addon-b']);
    });

    it('getAddOns returns empty for unknown tenant', async () => {
      if (!store.getAddOns) return;

      const addOns = await store.getAddOns('tenant-unknown');
      expect(addOns).toEqual([]);
    });
  });
}
