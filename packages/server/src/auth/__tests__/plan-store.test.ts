import { describe, expect, it } from 'bun:test';
import { defineAccess } from '../define-access';
import { checkAddOnCompatibility, getIncompatibleAddOns, InMemoryPlanStore } from '../plan-store';

describe('InMemoryPlanStore', () => {
  it('assignPlan stores org plan and getPlan retrieves it', async () => {
    const store = new InMemoryPlanStore();
    await store.assignPlan('org-1', 'free');

    const plan = await store.getPlan('org-1');
    expect(plan).not.toBeNull();
    expect(plan!.orgId).toBe('org-1');
    expect(plan!.planId).toBe('free');
    expect(plan!.startedAt).toBeInstanceOf(Date);
    expect(plan!.expiresAt).toBeNull();
    expect(plan!.overrides).toEqual({});
  });

  it('getPlan returns null for unknown org', async () => {
    const store = new InMemoryPlanStore();
    expect(await store.getPlan('org-unknown')).toBeNull();
  });

  it('assignPlan accepts custom startedAt and expiresAt', async () => {
    const store = new InMemoryPlanStore();
    const startedAt = new Date('2026-01-01T00:00:00Z');
    const expiresAt = new Date('2026-12-31T23:59:59Z');
    await store.assignPlan('org-1', 'pro', startedAt, expiresAt);

    const plan = await store.getPlan('org-1');
    expect(plan!.startedAt).toEqual(startedAt);
    expect(plan!.expiresAt).toEqual(expiresAt);
  });

  it('assignPlan overwrites existing plan for same org', async () => {
    const store = new InMemoryPlanStore();
    await store.assignPlan('org-1', 'free');
    await store.assignPlan('org-1', 'pro');

    const plan = await store.getPlan('org-1');
    expect(plan!.planId).toBe('pro');
  });

  it('updateOverrides merges overrides into existing plan', async () => {
    const store = new InMemoryPlanStore();
    await store.assignPlan('org-1', 'free');
    await store.updateOverrides('org-1', {
      'project:create': { max: 200 },
    });

    const plan = await store.getPlan('org-1');
    expect(plan!.overrides).toEqual({
      'project:create': { max: 200 },
    });
  });

  it('updateOverrides is a no-op for unknown org', async () => {
    const store = new InMemoryPlanStore();
    await store.updateOverrides('org-unknown', {
      'project:create': { max: 200 },
    });
    expect(await store.getPlan('org-unknown')).toBeNull();
  });

  it('removePlan clears org plan', async () => {
    const store = new InMemoryPlanStore();
    await store.assignPlan('org-1', 'free');
    await store.removePlan('org-1');
    expect(await store.getPlan('org-1')).toBeNull();
  });

  it('dispose clears all data', async () => {
    const store = new InMemoryPlanStore();
    await store.assignPlan('org-1', 'free');
    await store.assignPlan('org-2', 'pro');
    store.dispose();
    expect(await store.getPlan('org-1')).toBeNull();
    expect(await store.getPlan('org-2')).toBeNull();
  });
});

describe('checkAddOnCompatibility()', () => {
  const accessDef = defineAccess({
    entities: {
      workspace: { roles: ['admin'] },
    },
    entitlements: {
      'workspace:create': { roles: ['admin'] },
      'workspace:export': { roles: ['admin'] },
    },
    plans: {
      free: {
        group: 'main',
        features: ['workspace:create'],
      },
      pro: {
        group: 'main',
        features: ['workspace:create', 'workspace:export'],
      },
      export_addon: {
        addOn: true,
        features: ['workspace:export'],
        requires: { group: 'main', plans: ['pro'] },
      },
      basic_addon: {
        addOn: true,
        features: ['workspace:export'],
      },
    },
  });

  it('returns true for add-on compatible with current plan', () => {
    expect(checkAddOnCompatibility(accessDef, 'export_addon', 'pro')).toBe(true);
  });

  it('returns false for add-on incompatible with current plan', () => {
    expect(checkAddOnCompatibility(accessDef, 'export_addon', 'free')).toBe(false);
  });

  it('returns true for add-on without requires (always compatible)', () => {
    expect(checkAddOnCompatibility(accessDef, 'basic_addon', 'free')).toBe(true);
  });

  it('returns true for unknown add-on (no plan def found)', () => {
    expect(checkAddOnCompatibility(accessDef, 'nonexistent', 'pro')).toBe(true);
  });

  it('getIncompatibleAddOns returns add-ons incompatible with target plan', () => {
    const incompatible = getIncompatibleAddOns(accessDef, ['export_addon', 'basic_addon'], 'free');
    expect(incompatible).toEqual(['export_addon']);
  });

  it('getIncompatibleAddOns returns empty array when all compatible', () => {
    const incompatible = getIncompatibleAddOns(accessDef, ['export_addon', 'basic_addon'], 'pro');
    expect(incompatible).toEqual([]);
  });
});
