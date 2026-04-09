import { describe, expect, it } from '@vertz/test';
import { defineAccess } from '../define-access';
import { InMemoryOverrideStore, validateOverrides } from '../override-store';

describe('InMemoryOverrideStore', () => {
  it('set() stores feature overrides for a resource', async () => {
    const store = new InMemoryOverrideStore();
    await store.set('organization', 'org-1', { features: ['project:export'] });
    const overrides = await store.get('organization', 'org-1');
    expect(overrides?.features).toEqual(['project:export']);
  });

  it('set() stores limit overrides with add mode', async () => {
    const store = new InMemoryOverrideStore();
    await store.set('organization', 'org-1', { limits: { prompts: { add: 200 } } });
    const overrides = await store.get('organization', 'org-1');
    expect(overrides?.limits?.prompts).toEqual({ add: 200 });
  });

  it('set() stores limit overrides with max mode', async () => {
    const store = new InMemoryOverrideStore();
    await store.set('organization', 'org-1', { limits: { prompts: { max: 1000 } } });
    const overrides = await store.get('organization', 'org-1');
    expect(overrides?.limits?.prompts).toEqual({ max: 1000 });
  });

  it('get() returns all overrides for a resource', async () => {
    const store = new InMemoryOverrideStore();
    await store.set('organization', 'org-1', {
      features: ['project:export'],
      limits: { prompts: { add: 200 } },
    });
    const overrides = await store.get('organization', 'org-1');
    expect(overrides?.features).toEqual(['project:export']);
    expect(overrides?.limits?.prompts).toEqual({ add: 200 });
  });

  it('get() returns null when no overrides exist', async () => {
    const store = new InMemoryOverrideStore();
    const overrides = await store.get('organization', 'org-unknown');
    expect(overrides).toBeNull();
  });

  it('remove() clears specific limit overrides', async () => {
    const store = new InMemoryOverrideStore();
    await store.set('organization', 'org-1', {
      limits: { prompts: { add: 200 }, members: { max: 50 } },
    });
    await store.remove('organization', 'org-1', { limits: ['prompts'] });
    const overrides = await store.get('organization', 'org-1');
    expect(overrides?.limits?.prompts).toBeUndefined();
    expect(overrides?.limits?.members).toEqual({ max: 50 });
  });

  it('remove() clears specific feature overrides', async () => {
    const store = new InMemoryOverrideStore();
    await store.set('organization', 'org-1', { features: ['project:export', 'ai-assistant'] });
    await store.remove('organization', 'org-1', { features: ['project:export'] });
    const overrides = await store.get('organization', 'org-1');
    expect(overrides?.features).toEqual(['ai-assistant']);
  });

  it('set() with both add and max stores both', async () => {
    const store = new InMemoryOverrideStore();
    await store.set('organization', 'org-1', { limits: { prompts: { add: 100, max: 1000 } } });
    const overrides = await store.get('organization', 'org-1');
    expect(overrides?.limits?.prompts).toEqual({ add: 100, max: 1000 });
  });

  it('remove() of max reveals the add value', async () => {
    const store = new InMemoryOverrideStore();
    await store.set('organization', 'org-1', { limits: { prompts: { add: 100, max: 1000 } } });

    // Remove only the max by setting max to undefined via a new set
    // Actually, remove() removes entire limit keys. For removing just max,
    // we re-set with only add.
    await store.set('organization', 'org-1', { limits: { prompts: { add: 100 } } });
    const overrides = await store.get('organization', 'org-1');
    expect(overrides?.limits?.prompts).toEqual({ add: 100 });
  });

  it('set() merges features without duplicates', async () => {
    const store = new InMemoryOverrideStore();
    await store.set('organization', 'org-1', { features: ['project:export'] });
    await store.set('organization', 'org-1', { features: ['project:export', 'ai-assistant'] });
    const overrides = await store.get('organization', 'org-1');
    expect(overrides?.features).toEqual(['project:export', 'ai-assistant']);
  });

  it('dispose() clears all data', async () => {
    const store = new InMemoryOverrideStore();
    await store.set('organization', 'org-1', { features: ['project:export'] });
    store.dispose();
    const overrides = await store.get('organization', 'org-1');
    expect(overrides).toBeNull();
  });

  it('remove() is a no-op for unknown resource', async () => {
    const store = new InMemoryOverrideStore();
    // Should not throw
    await store.remove('organization', 'org-unknown', { features: ['x'], limits: ['y'] });
  });

  it('remove() clears entry when all overrides are removed', async () => {
    const store = new InMemoryOverrideStore();
    await store.set('organization', 'org-1', { features: ['project:export'] });
    await store.remove('organization', 'org-1', { features: ['project:export'] });
    const overrides = await store.get('organization', 'org-1');
    expect(overrides).toBeNull();
  });
});

describe('validateOverrides()', () => {
  const accessDef = defineAccess({
    entities: {
      organization: { roles: ['owner', 'admin'] },
    },
    entitlements: {
      'organization:create': { roles: ['admin', 'owner'] },
      'organization:invite': { roles: ['admin', 'owner'] },
    },
    plans: {
      free: {
        title: 'Free',
        group: 'main',
        features: ['organization:create'],
        limits: {
          prompts: { max: 100, gates: 'organization:create', per: 'month' },
          members: { max: 5, gates: 'organization:invite' },
        },
      },
    },
  });

  it('throws when limit key is not defined in any plan', () => {
    expect(() => validateOverrides(accessDef, { limits: { nonexistent: { add: 100 } } })).toThrow(
      "Override limit key 'nonexistent' is not defined in any plan",
    );
  });

  it('throws when feature references undefined entitlement', () => {
    expect(() => validateOverrides(accessDef, { features: ['nonexistent:feature'] })).toThrow(
      "Override feature 'nonexistent:feature' is not a defined entitlement",
    );
  });

  it('throws when max is negative and not -1', () => {
    expect(() => validateOverrides(accessDef, { limits: { prompts: { max: -2 } } })).toThrow(
      "Override limit 'prompts' max must be -1",
    );
  });

  it('allows add: -50 (reduction)', () => {
    expect(() => validateOverrides(accessDef, { limits: { prompts: { add: -50 } } })).not.toThrow();
  });

  it('allows max: 0 (disable)', () => {
    expect(() => validateOverrides(accessDef, { limits: { prompts: { max: 0 } } })).not.toThrow();
  });

  it('allows max: -1 (unlimited)', () => {
    expect(() => validateOverrides(accessDef, { limits: { prompts: { max: -1 } } })).not.toThrow();
  });

  it('allows valid feature override', () => {
    expect(() => validateOverrides(accessDef, { features: ['organization:create'] })).not.toThrow();
  });

  it('allows valid limit override with both add and max', () => {
    expect(() =>
      validateOverrides(accessDef, { limits: { prompts: { add: 100, max: 500 } } }),
    ).not.toThrow();
  });

  it('throws when add is NaN', () => {
    expect(() => validateOverrides(accessDef, { limits: { prompts: { add: NaN } } })).toThrow(
      "Override limit 'prompts' add must be a finite integer, got NaN",
    );
  });

  it('throws when add is Infinity', () => {
    expect(() => validateOverrides(accessDef, { limits: { prompts: { add: Infinity } } })).toThrow(
      "Override limit 'prompts' add must be a finite integer, got Infinity",
    );
  });

  it('throws when add is -Infinity', () => {
    expect(() => validateOverrides(accessDef, { limits: { prompts: { add: -Infinity } } })).toThrow(
      "Override limit 'prompts' add must be a finite integer, got -Infinity",
    );
  });

  it('throws when add is a non-integer (fractional)', () => {
    expect(() => validateOverrides(accessDef, { limits: { prompts: { add: 10.5 } } })).toThrow(
      "Override limit 'prompts' add must be an integer, got 10.5",
    );
  });

  it('allows add: 0', () => {
    expect(() => validateOverrides(accessDef, { limits: { prompts: { add: 0 } } })).not.toThrow();
  });
});
