import { describe, expect, it } from '@vertz/test';
import { getEntityStore } from '../entity-store-singleton';

describe('EntityStore singleton', () => {
  it('returns the same store instance on repeated calls', () => {
    const store1 = getEntityStore();
    const store2 = getEntityStore();
    expect(store1).toBe(store2);
  });
});
