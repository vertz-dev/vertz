import { describe, expect, it } from 'bun:test';
import { InMemoryPlanVersionStore } from '../plan-version-store';

describe('InMemoryPlanVersionStore', () => {
  it('createVersion stores snapshot and returns version number 1', async () => {
    const store = new InMemoryPlanVersionStore();
    const snapshot = { features: ['project:view'], limits: {}, price: null };

    const version = await store.createVersion('pro', 'hash-abc', snapshot);

    expect(version).toBe(1);
  });

  it('version numbers are sequential (1, 2, 3)', async () => {
    const store = new InMemoryPlanVersionStore();
    const snap = { features: ['a'], limits: {}, price: null };

    const v1 = await store.createVersion('pro', 'hash-1', snap);
    const v2 = await store.createVersion('pro', 'hash-2', snap);
    const v3 = await store.createVersion('pro', 'hash-3', snap);

    expect(v1).toBe(1);
    expect(v2).toBe(2);
    expect(v3).toBe(3);
  });

  it('getCurrentVersion returns latest version number', async () => {
    const store = new InMemoryPlanVersionStore();
    const snap = { features: ['a'], limits: {}, price: null };

    expect(await store.getCurrentVersion('pro')).toBeNull();

    await store.createVersion('pro', 'hash-1', snap);
    expect(await store.getCurrentVersion('pro')).toBe(1);

    await store.createVersion('pro', 'hash-2', snap);
    expect(await store.getCurrentVersion('pro')).toBe(2);
  });

  it('getVersion returns specific version snapshot', async () => {
    const store = new InMemoryPlanVersionStore();
    const snap1 = { features: ['a'], limits: {}, price: null };
    const snap2 = { features: ['a', 'b'], limits: {}, price: null };

    await store.createVersion('pro', 'hash-1', snap1);
    await store.createVersion('pro', 'hash-2', snap2);

    const v1 = await store.getVersion('pro', 1);
    expect(v1).not.toBeNull();
    expect(v1!.version).toBe(1);
    expect(v1!.hash).toBe('hash-1');
    expect(v1!.snapshot.features).toEqual(['a']);

    const v2 = await store.getVersion('pro', 2);
    expect(v2).not.toBeNull();
    expect(v2!.version).toBe(2);
    expect(v2!.snapshot.features).toEqual(['a', 'b']);
  });

  it('getVersion returns null for nonexistent plan or version', async () => {
    const store = new InMemoryPlanVersionStore();
    expect(await store.getVersion('nonexistent', 1)).toBeNull();

    await store.createVersion('pro', 'hash-1', { features: [], limits: {}, price: null });
    expect(await store.getVersion('pro', 99)).toBeNull();
  });

  it('getTenantVersion returns the version a tenant is on', async () => {
    const store = new InMemoryPlanVersionStore();
    expect(await store.getTenantVersion('org-1', 'pro')).toBeNull();

    await store.setTenantVersion('org-1', 'pro', 1);
    expect(await store.getTenantVersion('org-1', 'pro')).toBe(1);
  });

  it('getCurrentHash returns the hash of the latest version', async () => {
    const store = new InMemoryPlanVersionStore();
    expect(await store.getCurrentHash('pro')).toBeNull();

    await store.createVersion('pro', 'hash-1', { features: [], limits: {}, price: null });
    expect(await store.getCurrentHash('pro')).toBe('hash-1');

    await store.createVersion('pro', 'hash-2', { features: [], limits: {}, price: null });
    expect(await store.getCurrentHash('pro')).toBe('hash-2');
  });

  it('dispose clears all data', async () => {
    const store = new InMemoryPlanVersionStore();
    await store.createVersion('pro', 'hash-1', { features: [], limits: {}, price: null });
    await store.setTenantVersion('org-1', 'pro', 1);

    store.dispose();

    expect(await store.getCurrentVersion('pro')).toBeNull();
    expect(await store.getTenantVersion('org-1', 'pro')).toBeNull();
  });
});
