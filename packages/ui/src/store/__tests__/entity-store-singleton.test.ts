import { describe, expect, it } from 'bun:test';
import { getEntityStore, resetEntityStore } from '../entity-store-singleton';

describe('EntityStore singleton', () => {
  it('returns the same store instance on repeated calls', () => {
    const store1 = getEntityStore();
    const store2 = getEntityStore();
    expect(store1).toBe(store2);
  });

  it('resetEntityStore creates a fresh instance', () => {
    const store1 = getEntityStore();
    store1.merge('test', { id: '1', value: 'old' });

    resetEntityStore();

    const store2 = getEntityStore();
    expect(store2).not.toBe(store1);
    expect(store2.has('test', '1')).toBe(false);
  });
});
