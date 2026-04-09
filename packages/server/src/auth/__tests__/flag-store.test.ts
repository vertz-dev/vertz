import { describe, expect, it } from '@vertz/test';
import { InMemoryFlagStore } from '../flag-store';

describe('InMemoryFlagStore', () => {
  it('setFlag/getFlag basic CRUD', () => {
    const store = new InMemoryFlagStore();
    store.setFlag('tenant', 'org-1', 'feature-a', true);
    expect(store.getFlag('tenant', 'org-1', 'feature-a')).toBe(true);

    store.setFlag('tenant', 'org-1', 'feature-a', false);
    expect(store.getFlag('tenant', 'org-1', 'feature-a')).toBe(false);
  });

  it('getFlags returns all flags for resource', () => {
    const store = new InMemoryFlagStore();
    store.setFlag('tenant', 'org-1', 'feature-a', true);
    store.setFlag('tenant', 'org-1', 'feature-b', false);
    store.setFlag('tenant', 'org-1', 'feature-c', true);

    const flags = store.getFlags('tenant', 'org-1');
    expect(flags).toEqual({
      'feature-a': true,
      'feature-b': false,
      'feature-c': true,
    });
  });

  it('getFlag returns false for unknown flag', () => {
    const store = new InMemoryFlagStore();
    expect(store.getFlag('tenant', 'org-1', 'nonexistent')).toBe(false);
  });

  it('getFlags returns empty object for unknown resource', () => {
    const store = new InMemoryFlagStore();
    expect(store.getFlags('tenant', 'unknown-org')).toEqual({});
  });

  it('flags are resource-scoped (different resources are independent)', () => {
    const store = new InMemoryFlagStore();
    store.setFlag('tenant', 'org-1', 'feature-a', true);
    store.setFlag('tenant', 'org-2', 'feature-a', false);

    expect(store.getFlag('tenant', 'org-1', 'feature-a')).toBe(true);
    expect(store.getFlag('tenant', 'org-2', 'feature-a')).toBe(false);

    const org1Flags = store.getFlags('tenant', 'org-1');
    const org2Flags = store.getFlags('tenant', 'org-2');
    expect(org1Flags).toEqual({ 'feature-a': true });
    expect(org2Flags).toEqual({ 'feature-a': false });
  });

  it('flags are isolated by resource type (same id, different type)', () => {
    const store = new InMemoryFlagStore();
    store.setFlag('account', 'id-1', 'beta_ai', true);
    store.setFlag('project', 'id-1', 'beta_ai', false);

    expect(store.getFlag('account', 'id-1', 'beta_ai')).toBe(true);
    expect(store.getFlag('project', 'id-1', 'beta_ai')).toBe(false);

    expect(store.getFlags('account', 'id-1')).toEqual({ beta_ai: true });
    expect(store.getFlags('project', 'id-1')).toEqual({ beta_ai: false });
  });
});
