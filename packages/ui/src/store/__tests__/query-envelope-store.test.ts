import { describe, expect, it } from 'bun:test';
import { QueryEnvelopeStore } from '../query-envelope-store';

describe('QueryEnvelopeStore', () => {
  it('set/get: stores and retrieves envelope', () => {
    const store = new QueryEnvelopeStore();
    store.set('GET:/todos', { total: 42, limit: 20, nextCursor: 'abc', hasNextPage: true });
    expect(store.get('GET:/todos')).toEqual({
      total: 42,
      limit: 20,
      nextCursor: 'abc',
      hasNextPage: true,
    });
  });

  it('get returns undefined for missing key', () => {
    const store = new QueryEnvelopeStore();
    expect(store.get('nonexistent')).toBeUndefined();
  });

  it('clear removes all entries', () => {
    const store = new QueryEnvelopeStore();
    store.set('key1', { total: 1, limit: 10, nextCursor: null, hasNextPage: false });
    store.set('key2', { total: 2, limit: 10, nextCursor: null, hasNextPage: false });

    store.clear();

    expect(store.get('key1')).toBeUndefined();
    expect(store.get('key2')).toBeUndefined();
  });
});
