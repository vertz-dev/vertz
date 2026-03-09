import { describe, expect, it } from 'bun:test';
import { InMemoryGrandfatheringStore } from '../grandfathering-store';

describe('InMemoryGrandfatheringStore', () => {
  it('setGrandfathered marks tenant as grandfathered with grace end date', async () => {
    const store = new InMemoryGrandfatheringStore();
    const graceEnds = new Date('2027-01-15T00:00:00Z');

    await store.setGrandfathered('org-1', 'pro', 1, graceEnds);

    const state = await store.getGrandfathered('org-1', 'pro');
    expect(state).not.toBeNull();
    expect(state!.tenantId).toBe('org-1');
    expect(state!.planId).toBe('pro');
    expect(state!.version).toBe(1);
    expect(state!.graceEnds).toEqual(graceEnds);
  });

  it('getGrandfathered returns null for non-grandfathered tenant', async () => {
    const store = new InMemoryGrandfatheringStore();
    expect(await store.getGrandfathered('org-1', 'pro')).toBeNull();
  });

  it('setGrandfathered supports null graceEnds for indefinite grandfathering', async () => {
    const store = new InMemoryGrandfatheringStore();
    await store.setGrandfathered('org-1', 'pro', 1, null);

    const state = await store.getGrandfathered('org-1', 'pro');
    expect(state).not.toBeNull();
    expect(state!.graceEnds).toBeNull();
  });

  it('listGrandfathered returns all grandfathered tenants for a plan', async () => {
    const store = new InMemoryGrandfatheringStore();
    const graceEnds = new Date('2027-01-15T00:00:00Z');

    await store.setGrandfathered('org-1', 'pro', 1, graceEnds);
    await store.setGrandfathered('org-2', 'pro', 1, graceEnds);
    await store.setGrandfathered('org-3', 'enterprise', 1, graceEnds);

    const proTenants = await store.listGrandfathered('pro');
    expect(proTenants.length).toBe(2);
    expect(proTenants.map((s) => s.tenantId).sort()).toEqual(['org-1', 'org-2']);

    const entTenants = await store.listGrandfathered('enterprise');
    expect(entTenants.length).toBe(1);
    expect(entTenants[0].tenantId).toBe('org-3');
  });

  it('listGrandfathered returns empty array when none exist', async () => {
    const store = new InMemoryGrandfatheringStore();
    expect(await store.listGrandfathered('pro')).toEqual([]);
  });

  it('removeGrandfathered clears state after migration', async () => {
    const store = new InMemoryGrandfatheringStore();
    await store.setGrandfathered('org-1', 'pro', 1, new Date('2027-01-15'));

    await store.removeGrandfathered('org-1', 'pro');

    expect(await store.getGrandfathered('org-1', 'pro')).toBeNull();
  });

  it('removeGrandfathered is a no-op if tenant was not grandfathered', async () => {
    const store = new InMemoryGrandfatheringStore();
    // Should not throw
    await store.removeGrandfathered('org-1', 'pro');
    expect(await store.getGrandfathered('org-1', 'pro')).toBeNull();
  });

  it('dispose clears all data', async () => {
    const store = new InMemoryGrandfatheringStore();
    await store.setGrandfathered('org-1', 'pro', 1, new Date('2027-01-15'));
    await store.setGrandfathered('org-2', 'pro', 1, new Date('2027-01-15'));

    store.dispose();

    expect(await store.getGrandfathered('org-1', 'pro')).toBeNull();
    expect(await store.listGrandfathered('pro')).toEqual([]);
  });
});
