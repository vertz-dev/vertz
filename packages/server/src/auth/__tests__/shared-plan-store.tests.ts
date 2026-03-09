/**
 * Shared test factory for PlanStore behavioral parity.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { PlanStore } from '../plan-store';

export function planStoreTests(
  name: string,
  factory: () => Promise<{ store: PlanStore; cleanup: () => Promise<void> }>,
) {
  describe(`PlanStore: ${name}`, () => {
    let store: PlanStore;
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

    it('assigns a plan and retrieves it', async () => {
      await store.assignPlan('org-1', 'free');

      const plan = await store.getPlan('org-1');
      expect(plan).not.toBeNull();
      expect(plan!.orgId).toBe('org-1');
      expect(plan!.planId).toBe('free');
      expect(plan!.startedAt).toBeInstanceOf(Date);
      expect(plan!.expiresAt).toBeNull();
      expect(plan!.overrides).toEqual({});
    });

    it('returns null for unknown org', async () => {
      expect(await store.getPlan('org-unknown')).toBeNull();
    });

    it('accepts custom startedAt and expiresAt', async () => {
      const startedAt = new Date('2026-01-01T00:00:00Z');
      const expiresAt = new Date('2026-12-31T23:59:59Z');
      await store.assignPlan('org-1', 'pro', startedAt, expiresAt);

      const plan = await store.getPlan('org-1');
      expect(plan!.startedAt.getTime()).toBe(startedAt.getTime());
      expect(plan!.expiresAt!.getTime()).toBe(expiresAt.getTime());
    });

    it('overwrites existing plan for same org', async () => {
      await store.assignPlan('org-1', 'free');
      await store.assignPlan('org-1', 'pro');

      const plan = await store.getPlan('org-1');
      expect(plan!.planId).toBe('pro');
    });

    it('assignPlan resets overrides', async () => {
      await store.assignPlan('org-1', 'free');
      await store.updateOverrides('org-1', {
        'project:create': { max: 200 },
      });
      // Re-assign plan — overrides should reset
      await store.assignPlan('org-1', 'pro');

      const plan = await store.getPlan('org-1');
      expect(plan!.overrides).toEqual({});
    });

    it('updateOverrides merges overrides into existing plan', async () => {
      await store.assignPlan('org-1', 'free');
      await store.updateOverrides('org-1', {
        'project:create': { max: 200 },
      });

      const plan = await store.getPlan('org-1');
      expect(plan!.overrides).toEqual({
        'project:create': { max: 200 },
      });
    });

    it('updateOverrides merges with existing overrides', async () => {
      await store.assignPlan('org-1', 'free');
      await store.updateOverrides('org-1', {
        'project:create': { max: 200 },
      });
      await store.updateOverrides('org-1', {
        'api:call': { max: 5000 },
      });

      const plan = await store.getPlan('org-1');
      expect(plan!.overrides).toEqual({
        'project:create': { max: 200 },
        'api:call': { max: 5000 },
      });
    });

    it('updateOverrides is a no-op for unknown org', async () => {
      await store.updateOverrides('org-unknown', {
        'project:create': { max: 200 },
      });
      expect(await store.getPlan('org-unknown')).toBeNull();
    });

    it('removePlan clears org plan', async () => {
      await store.assignPlan('org-1', 'free');
      await store.removePlan('org-1');
      expect(await store.getPlan('org-1')).toBeNull();
    });

    it('removePlan also clears overrides', async () => {
      await store.assignPlan('org-1', 'free');
      await store.updateOverrides('org-1', {
        'project:create': { max: 200 },
      });
      await store.removePlan('org-1');

      // Re-assign and check overrides are gone
      await store.assignPlan('org-1', 'pro');
      const plan = await store.getPlan('org-1');
      expect(plan!.overrides).toEqual({});
    });
  });
}
