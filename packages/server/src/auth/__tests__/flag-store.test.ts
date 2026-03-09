import { describe, expect, it } from 'bun:test';
import { InMemoryFlagStore } from '../flag-store';

describe('InMemoryFlagStore', () => {
  it('setFlag/getFlag basic CRUD', () => {
    const store = new InMemoryFlagStore();
    store.setFlag('org-1', 'feature-a', true);
    expect(store.getFlag('org-1', 'feature-a')).toBe(true);

    store.setFlag('org-1', 'feature-a', false);
    expect(store.getFlag('org-1', 'feature-a')).toBe(false);
  });

  it('getFlags returns all flags for org', () => {
    const store = new InMemoryFlagStore();
    store.setFlag('org-1', 'feature-a', true);
    store.setFlag('org-1', 'feature-b', false);
    store.setFlag('org-1', 'feature-c', true);

    const flags = store.getFlags('org-1');
    expect(flags).toEqual({
      'feature-a': true,
      'feature-b': false,
      'feature-c': true,
    });
  });

  it('getFlag returns false for unknown flag', () => {
    const store = new InMemoryFlagStore();
    expect(store.getFlag('org-1', 'nonexistent')).toBe(false);
  });

  it('getFlags returns empty object for unknown org', () => {
    const store = new InMemoryFlagStore();
    expect(store.getFlags('unknown-org')).toEqual({});
  });

  it('flags are org-scoped (different orgs are independent)', () => {
    const store = new InMemoryFlagStore();
    store.setFlag('org-1', 'feature-a', true);
    store.setFlag('org-2', 'feature-a', false);

    expect(store.getFlag('org-1', 'feature-a')).toBe(true);
    expect(store.getFlag('org-2', 'feature-a')).toBe(false);

    const org1Flags = store.getFlags('org-1');
    const org2Flags = store.getFlags('org-2');
    expect(org1Flags).toEqual({ 'feature-a': true });
    expect(org2Flags).toEqual({ 'feature-a': false });
  });
});
