import { describe, expect, it } from '@vertz/test';
import { InMemoryGrandfatheringStore } from '../grandfathering-store';

describe('InMemoryGrandfatheringStore', () => {
  it('setGrandfathered marks resource as grandfathered with grace end date', async () => {
    const store = new InMemoryGrandfatheringStore();
    const graceEnds = new Date('2027-01-15T00:00:00Z');

    await store.setGrandfathered('tenant', 'org-1', 'pro', 1, graceEnds);

    const state = await store.getGrandfathered('tenant', 'org-1', 'pro');
    expect(state).not.toBeNull();
    expect(state!.resourceType).toBe('tenant');
    expect(state!.resourceId).toBe('org-1');
    expect(state!.planId).toBe('pro');
    expect(state!.version).toBe(1);
    expect(state!.graceEnds).toEqual(graceEnds);
  });

  it('getGrandfathered returns null for non-grandfathered resource', async () => {
    const store = new InMemoryGrandfatheringStore();
    expect(await store.getGrandfathered('tenant', 'org-1', 'pro')).toBeNull();
  });

  it('setGrandfathered supports null graceEnds for indefinite grandfathering', async () => {
    const store = new InMemoryGrandfatheringStore();
    await store.setGrandfathered('tenant', 'org-1', 'pro', 1, null);

    const state = await store.getGrandfathered('tenant', 'org-1', 'pro');
    expect(state).not.toBeNull();
    expect(state!.graceEnds).toBeNull();
  });

  it('listGrandfathered returns all grandfathered resources for a plan', async () => {
    const store = new InMemoryGrandfatheringStore();
    const graceEnds = new Date('2027-01-15T00:00:00Z');

    await store.setGrandfathered('tenant', 'org-1', 'pro', 1, graceEnds);
    await store.setGrandfathered('tenant', 'org-2', 'pro', 1, graceEnds);
    await store.setGrandfathered('tenant', 'org-3', 'enterprise', 1, graceEnds);

    const proResources = await store.listGrandfathered('pro');
    expect(proResources.length).toBe(2);
    expect(proResources.map((s) => s.resourceId).sort()).toEqual(['org-1', 'org-2']);

    const entResources = await store.listGrandfathered('enterprise');
    expect(entResources.length).toBe(1);
    expect(entResources[0].resourceId).toBe('org-3');
  });

  it('listGrandfathered returns empty array when none exist', async () => {
    const store = new InMemoryGrandfatheringStore();
    expect(await store.listGrandfathered('pro')).toEqual([]);
  });

  it('removeGrandfathered clears state after migration', async () => {
    const store = new InMemoryGrandfatheringStore();
    await store.setGrandfathered('tenant', 'org-1', 'pro', 1, new Date('2027-01-15'));

    await store.removeGrandfathered('tenant', 'org-1', 'pro');

    expect(await store.getGrandfathered('tenant', 'org-1', 'pro')).toBeNull();
  });

  it('removeGrandfathered is a no-op if resource was not grandfathered', async () => {
    const store = new InMemoryGrandfatheringStore();
    // Should not throw
    await store.removeGrandfathered('tenant', 'org-1', 'pro');
    expect(await store.getGrandfathered('tenant', 'org-1', 'pro')).toBeNull();
  });

  it('different resourceTypes with same ID are distinct entries', async () => {
    const store = new InMemoryGrandfatheringStore();
    const graceEnds = new Date('2027-01-15T00:00:00Z');

    await store.setGrandfathered('account', 'id-1', 'pro', 1, graceEnds);
    await store.setGrandfathered('project', 'id-1', 'pro', 2, graceEnds);

    const acctState = await store.getGrandfathered('account', 'id-1', 'pro');
    expect(acctState!.version).toBe(1);
    expect(acctState!.resourceType).toBe('account');

    const projState = await store.getGrandfathered('project', 'id-1', 'pro');
    expect(projState!.version).toBe(2);
    expect(projState!.resourceType).toBe('project');
  });

  it('dispose clears all data', async () => {
    const store = new InMemoryGrandfatheringStore();
    await store.setGrandfathered('tenant', 'org-1', 'pro', 1, new Date('2027-01-15'));
    await store.setGrandfathered('tenant', 'org-2', 'pro', 1, new Date('2027-01-15'));

    store.dispose();

    expect(await store.getGrandfathered('tenant', 'org-1', 'pro')).toBeNull();
    expect(await store.listGrandfathered('pro')).toEqual([]);
  });
});
