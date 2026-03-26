import { describe, expect, it } from 'bun:test';
import { defineAccess } from '../define-access';
import {
  checkAddOnCompatibility,
  getIncompatibleAddOns,
  InMemorySubscriptionStore,
} from '../subscription-store';

describe('InMemorySubscriptionStore', () => {
  it('assign stores subscription with resourceType and resourceId', async () => {
    const store = new InMemorySubscriptionStore();
    await store.assign('tenant', 'tenant-1', 'free');

    const sub = await store.get('tenant', 'tenant-1');
    expect(sub).not.toBeNull();
    expect(sub!.resourceType).toBe('tenant');
    expect(sub!.resourceId).toBe('tenant-1');
    expect(sub!.planId).toBe('free');
    expect(sub!.startedAt).toBeInstanceOf(Date);
    expect(sub!.expiresAt).toBeNull();
    expect(sub!.overrides).toEqual({});
  });

  it('get returns null for unknown resource', async () => {
    const store = new InMemorySubscriptionStore();
    expect(await store.get('tenant', 'tenant-unknown')).toBeNull();
  });

  it('assign accepts custom startedAt and expiresAt', async () => {
    const store = new InMemorySubscriptionStore();
    const startedAt = new Date('2026-01-01T00:00:00Z');
    const expiresAt = new Date('2026-12-31T23:59:59Z');
    await store.assign('tenant', 'tenant-1', 'pro', startedAt, expiresAt);

    const sub = await store.get('tenant', 'tenant-1');
    expect(sub!.startedAt).toEqual(startedAt);
    expect(sub!.expiresAt).toEqual(expiresAt);
  });

  it('assign overwrites existing subscription for same (resourceType, resourceId)', async () => {
    const store = new InMemorySubscriptionStore();
    await store.assign('tenant', 'tenant-1', 'free');
    await store.assign('tenant', 'tenant-1', 'pro');

    const sub = await store.get('tenant', 'tenant-1');
    expect(sub!.planId).toBe('pro');
  });

  it('different resourceTypes with same ID are distinct subscriptions', async () => {
    const store = new InMemorySubscriptionStore();
    await store.assign('account', 'id-1', 'enterprise');
    await store.assign('project', 'id-1', 'pro');

    const acctSub = await store.get('account', 'id-1');
    expect(acctSub!.planId).toBe('enterprise');
    expect(acctSub!.resourceType).toBe('account');

    const projSub = await store.get('project', 'id-1');
    expect(projSub!.planId).toBe('pro');
    expect(projSub!.resourceType).toBe('project');
  });

  it('updateOverrides merges overrides into existing subscription', async () => {
    const store = new InMemorySubscriptionStore();
    await store.assign('tenant', 'tenant-1', 'free');
    await store.updateOverrides('tenant', 'tenant-1', {
      'project:create': { max: 200 },
    });

    const sub = await store.get('tenant', 'tenant-1');
    expect(sub!.overrides).toEqual({
      'project:create': { max: 200 },
    });
  });

  it('updateOverrides is a no-op for unknown resource', async () => {
    const store = new InMemorySubscriptionStore();
    await store.updateOverrides('tenant', 'tenant-unknown', {
      'project:create': { max: 200 },
    });
    expect(await store.get('tenant', 'tenant-unknown')).toBeNull();
  });

  it('remove clears subscription', async () => {
    const store = new InMemorySubscriptionStore();
    await store.assign('tenant', 'tenant-1', 'free');
    await store.remove('tenant', 'tenant-1');
    expect(await store.get('tenant', 'tenant-1')).toBeNull();
  });

  it('dispose clears all data', async () => {
    const store = new InMemorySubscriptionStore();
    await store.assign('tenant', 'tenant-1', 'free');
    await store.assign('tenant', 'tenant-2', 'pro');
    store.dispose();
    expect(await store.get('tenant', 'tenant-1')).toBeNull();
    expect(await store.get('tenant', 'tenant-2')).toBeNull();
  });

  it('listByPlan returns array of { resourceType, resourceId }', async () => {
    const store = new InMemorySubscriptionStore();
    await store.assign('account', 'acct-1', 'pro');
    await store.assign('project', 'proj-1', 'pro');
    await store.assign('project', 'proj-2', 'free');

    const proResources = await store.listByPlan('pro');
    expect(proResources).toHaveLength(2);
    expect(proResources).toContainEqual({ resourceType: 'account', resourceId: 'acct-1' });
    expect(proResources).toContainEqual({ resourceType: 'project', resourceId: 'proj-1' });
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
