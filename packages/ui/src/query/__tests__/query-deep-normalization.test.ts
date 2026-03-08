import { afterEach, beforeEach, describe, expect, test, vi } from 'bun:test';
import { ok } from '@vertz/fetch';
import { getEntityStore, resetEntityStore } from '../../store/entity-store-singleton';
import {
  registerRelationSchema,
  resetRelationSchemas_TEST_ONLY,
} from '../../store/relation-registry';
import { query, resetDefaultQueryCache } from '../query';

/**
 * Integration tests for deep normalization through query().
 * Exercises the full pipeline: fetch → normalizeToEntityStore → resolveReferences → ref counting.
 */
describe('query() deep normalization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetEntityStore();
    resetRelationSchemas_TEST_ONLY();
    resetDefaultQueryCache();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function createGetDescriptor(entityType: string, id: string, data: Record<string, unknown>) {
    return {
      _tag: 'QueryDescriptor' as const,
      _key: `GET:/${entityType}/${id}`,
      _entity: { entityType, kind: 'get' as const, id },
      _fetch: () => Promise.resolve(ok(data)),
      // biome-ignore lint/suspicious/noThenProperty: intentional PromiseLike implementation for mock descriptor
      then(onFulfilled: any, onRejected: any) {
        return this._fetch().then(onFulfilled, onRejected);
      },
    };
  }

  function createListDescriptor(
    entityType: string,
    data: { items: Record<string, unknown>[]; total?: number },
    key?: string,
  ) {
    return {
      _tag: 'QueryDescriptor' as const,
      _key: key ?? `GET:/${entityType}`,
      _entity: { entityType, kind: 'list' as const },
      _fetch: () => Promise.resolve(ok(data)),
      // biome-ignore lint/suspicious/noThenProperty: intentional PromiseLike implementation for mock descriptor
      then(onFulfilled: any, onRejected: any) {
        return this._fetch().then(onFulfilled, onRejected);
      },
    };
  }

  async function settle() {
    vi.advanceTimersByTime(0);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  test('get query resolves nested one-relation through EntityStore', async () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const descriptor = createGetDescriptor('posts', 'p1', {
      id: 'p1',
      title: 'Hello',
      author: { id: 'u1', name: 'John' },
    });

    const result = query(descriptor);
    await settle();

    // query().data should resolve the nested author
    const data = result.data.value as Record<string, unknown>;
    expect(data.title).toBe('Hello');
    expect((data.author as Record<string, unknown>).name).toBe('John');

    // Both entities should be in the store
    const store = getEntityStore();
    expect(store.get('posts', 'p1').peek()).toEqual({
      id: 'p1',
      title: 'Hello',
      author: 'u1',
    });
    expect(store.get('users', 'u1').peek()).toEqual({
      id: 'u1',
      name: 'John',
    });

    result.dispose();
  });

  test('get query reflects cross-entity updates via EntityStore', async () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const descriptor = createGetDescriptor('posts', 'p1', {
      id: 'p1',
      title: 'Hello',
      author: { id: 'u1', name: 'John' },
    });

    const result = query(descriptor);
    await settle();

    // Update the user directly in the store
    const store = getEntityStore();
    store.merge('users', { id: 'u1', name: 'Jane' });

    // query().data should reflect the cross-entity update
    const data = result.data.value as Record<string, unknown>;
    expect((data.author as Record<string, unknown>).name).toBe('Jane');

    result.dispose();
  });

  test('list query resolves nested relations for all items', async () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const descriptor = createListDescriptor('posts', {
      items: [
        { id: 'p1', title: 'First', author: { id: 'u1', name: 'John' } },
        { id: 'p2', title: 'Second', author: { id: 'u1', name: 'John' } },
      ],
      total: 2,
    });

    const result = query(descriptor);
    await settle();

    const data = result.data.value as { items: Record<string, unknown>[]; total: number };
    expect(data.items).toHaveLength(2);
    expect((data.items[0].author as Record<string, unknown>).name).toBe('John');
    expect((data.items[1].author as Record<string, unknown>).name).toBe('John');

    // Only 1 user entity in the store
    const store = getEntityStore();
    expect(store.size('users')).toBe(1);

    // Update user → both items reflect it
    store.merge('users', { id: 'u1', name: 'Jane' });
    const updated = result.data.value as { items: Record<string, unknown>[] };
    expect((updated.items[0].author as Record<string, unknown>).name).toBe('Jane');
    expect((updated.items[1].author as Record<string, unknown>).name).toBe('Jane');

    result.dispose();
  });

  test('get query increments refCount and decrements on dispose', async () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const descriptor = createGetDescriptor('posts', 'p1', {
      id: 'p1',
      title: 'Hello',
      author: { id: 'u1', name: 'John' },
    });

    const result = query(descriptor);
    await settle();

    // Reading data triggers the computed, which calls resolveReferences + updateRefCounts
    const data = result.data.value;
    expect(data).toBeDefined();

    const store = getEntityStore();
    // Both post and user should have refCount > 0
    expect(store.inspect('posts', 'p1')?.refCount).toBeGreaterThan(0);
    expect(store.inspect('users', 'u1')?.refCount).toBeGreaterThan(0);

    result.dispose();

    // After dispose, ref counts should be 0
    expect(store.inspect('posts', 'p1')?.refCount).toBe(0);
    expect(store.inspect('users', 'u1')?.refCount).toBe(0);
    // orphanedAt should be set
    expect(store.inspect('posts', 'p1')?.orphanedAt).not.toBeNull();
    expect(store.inspect('users', 'u1')?.orphanedAt).not.toBeNull();
  });

  test('two queries sharing an entity accumulate refCount', async () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const desc1 = createGetDescriptor('posts', 'p1', {
      id: 'p1',
      title: 'First',
      author: { id: 'u1', name: 'John' },
    });
    const desc2 = createGetDescriptor('posts', 'p2', {
      id: 'p2',
      title: 'Second',
      author: { id: 'u1', name: 'John' },
    });

    const result1 = query(desc1);
    await settle();
    const result2 = query(desc2);
    await settle();

    // Read data to trigger computed evaluation + ref counting
    expect(result1.data.value).toBeDefined();
    expect(result2.data.value).toBeDefined();

    const store = getEntityStore();
    // User referenced by both queries
    expect(store.inspect('users', 'u1')?.refCount).toBe(2);

    // Dispose first query — user still has 1 ref
    result1.dispose();
    expect(store.inspect('users', 'u1')?.refCount).toBe(1);
    expect(store.inspect('users', 'u1')?.orphanedAt).toBeNull();

    // Dispose second query — user now orphaned
    result2.dispose();
    expect(store.inspect('users', 'u1')?.refCount).toBe(0);
    expect(store.inspect('users', 'u1')?.orphanedAt).not.toBeNull();
  });

  test('transitive refs: post → author → org all get refCount', async () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });
    registerRelationSchema('users', {
      organization: { type: 'one', entity: 'orgs' },
    });

    const descriptor = createGetDescriptor('posts', 'p1', {
      id: 'p1',
      title: 'Hello',
      author: {
        id: 'u1',
        name: 'John',
        organization: { id: 'o1', name: 'Acme' },
      },
    });

    const result = query(descriptor);
    await settle();

    // Read data to trigger computed evaluation + ref counting
    const data = result.data.value;
    expect(data).toBeDefined();

    const store = getEntityStore();
    // Verify entities exist in store
    expect(store.has('posts', 'p1')).toBe(true);
    expect(store.has('users', 'u1')).toBe(true);
    expect(store.has('orgs', 'o1')).toBe(true);

    expect(store.inspect('posts', 'p1')?.refCount).toBeGreaterThan(0);
    expect(store.inspect('users', 'u1')?.refCount).toBeGreaterThan(0);
    expect(store.inspect('orgs', 'o1')?.refCount).toBeGreaterThan(0);

    result.dispose();

    expect(store.inspect('posts', 'p1')?.refCount).toBe(0);
    expect(store.inspect('users', 'u1')?.refCount).toBe(0);
    expect(store.inspect('orgs', 'o1')?.refCount).toBe(0);
  });
});
