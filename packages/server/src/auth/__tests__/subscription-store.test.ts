import { describe, expect, it } from 'bun:test';
import { defineAccess } from '../define-access';
import {
  checkAddOnCompatibility,
  getIncompatibleAddOns,
  InMemorySubscriptionStore,
} from '../subscription-store';

describe('InMemorySubscriptionStore', () => {
  it('assign stores subscription and get retrieves it', async () => {
    const store = new InMemorySubscriptionStore();
    await store.assign('tenant-1', 'free');

    const sub = await store.get('tenant-1');
    expect(sub).not.toBeNull();
    expect(sub!.tenantId).toBe('tenant-1');
    expect(sub!.planId).toBe('free');
    expect(sub!.startedAt).toBeInstanceOf(Date);
    expect(sub!.expiresAt).toBeNull();
    expect(sub!.overrides).toEqual({});
  });

  it('get returns null for unknown tenant', async () => {
    const store = new InMemorySubscriptionStore();
    expect(await store.get('tenant-unknown')).toBeNull();
  });

  it('assign accepts custom startedAt and expiresAt', async () => {
    const store = new InMemorySubscriptionStore();
    const startedAt = new Date('2026-01-01T00:00:00Z');
    const expiresAt = new Date('2026-12-31T23:59:59Z');
    await store.assign('tenant-1', 'pro', startedAt, expiresAt);

    const sub = await store.get('tenant-1');
    expect(sub!.startedAt).toEqual(startedAt);
    expect(sub!.expiresAt).toEqual(expiresAt);
  });

  it('assign overwrites existing subscription for same tenant', async () => {
    const store = new InMemorySubscriptionStore();
    await store.assign('tenant-1', 'free');
    await store.assign('tenant-1', 'pro');

    const sub = await store.get('tenant-1');
    expect(sub!.planId).toBe('pro');
  });

  it('updateOverrides merges overrides into existing subscription', async () => {
    const store = new InMemorySubscriptionStore();
    await store.assign('tenant-1', 'free');
    await store.updateOverrides('tenant-1', {
      'project:create': { max: 200 },
    });

    const sub = await store.get('tenant-1');
    expect(sub!.overrides).toEqual({
      'project:create': { max: 200 },
    });
  });

  it('updateOverrides is a no-op for unknown tenant', async () => {
    const store = new InMemorySubscriptionStore();
    await store.updateOverrides('tenant-unknown', {
      'project:create': { max: 200 },
    });
    expect(await store.get('tenant-unknown')).toBeNull();
  });

  it('remove clears subscription', async () => {
    const store = new InMemorySubscriptionStore();
    await store.assign('tenant-1', 'free');
    await store.remove('tenant-1');
    expect(await store.get('tenant-1')).toBeNull();
  });

  it('dispose clears all data', async () => {
    const store = new InMemorySubscriptionStore();
    await store.assign('tenant-1', 'free');
    await store.assign('tenant-2', 'pro');
    store.dispose();
    expect(await store.get('tenant-1')).toBeNull();
    expect(await store.get('tenant-2')).toBeNull();
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
