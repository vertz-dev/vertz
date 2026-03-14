import { afterEach, describe, expect, it, vi } from 'bun:test';
import { domEffect } from '../../runtime/signal';
import { EntityStore } from '../entity-store';
import { registerRelationSchema, resetRelationSchemas_TEST_ONLY } from '../relation-registry';

interface User {
  id: string;
  name: string;
  age?: number;
  tags?: string[];
  address?: { city: string; zip?: string };
}

interface Post {
  id: string;
  title: string;
  authorId: string;
}

describe('EntityStore - get/has/size', () => {
  it('get returns undefined signal for missing entity', () => {
    const store = new EntityStore();
    const signal = store.get<User>('User', '999');
    expect(signal.value).toBeUndefined();
  });

  it('get returns signal with data after merge', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice' });
    const signal = store.get<User>('User', '1');
    expect(signal.value).toEqual({ id: '1', name: 'Alice' });
  });

  it('get returns same signal instance on repeated calls (identity stability)', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice' });
    const signal1 = store.get<User>('User', '1');
    const signal2 = store.get<User>('User', '1');
    expect(signal1).toBe(signal2); // same object reference
  });

  it('has returns false for missing, true for existing', () => {
    const store = new EntityStore();
    expect(store.has('User', '1')).toBe(false);
    store.merge('User', { id: '1', name: 'Alice' });
    expect(store.has('User', '1')).toBe(true);
  });

  it('size returns 0 for empty type, correct count after merges', () => {
    const store = new EntityStore();
    expect(store.size('User')).toBe(0);
    store.merge('User', { id: '1', name: 'Alice' });
    expect(store.size('User')).toBe(1);
    store.merge('User', [
      { id: '2', name: 'Bob' },
      { id: '3', name: 'Charlie' },
    ]);
    expect(store.size('User')).toBe(3);
  });
});

describe('EntityStore - merge', () => {
  it('merge single entity creates new entry', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice' });
    expect(store.get<User>('User', '1').value).toEqual({ id: '1', name: 'Alice' });
  });

  it('merge array of entities creates all entries', () => {
    const store = new EntityStore();
    store.merge('User', [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
    expect(store.get<User>('User', '1').value).toEqual({ id: '1', name: 'Alice' });
    expect(store.get<User>('User', '2').value).toEqual({ id: '2', name: 'Bob' });
  });

  it('merge existing entity updates signal value', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice', age: 25 });
    const signal = store.get<User>('User', '1');

    store.merge('User', { id: '1', age: 30 });

    expect(signal.value).toEqual({ id: '1', name: 'Alice', age: 30 });
  });

  it("merge with new fields enriches (doesn't lose existing fields)", () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice' });
    store.merge('User', { id: '1', age: 30 });

    expect(store.get<User>('User', '1').value).toEqual({
      id: '1',
      name: 'Alice',
      age: 30,
    });
  });

  it('merge with unchanged data does NOT trigger signal update', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice', age: 25 });

    const signal = store.get<User>('User', '1');
    let updateCount = 0;
    domEffect(() => {
      signal.value; // subscribe
      updateCount++;
    });

    const initialCount = updateCount;
    store.merge('User', { id: '1', name: 'Alice', age: 25 }); // same data

    expect(updateCount).toBe(initialCount); // no additional update
  });

  it('merge with changed field triggers signal update', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice', age: 25 });

    const signal = store.get<User>('User', '1');
    let updateCount = 0;
    domEffect(() => {
      signal.value;
      updateCount++;
    });

    const initialCount = updateCount;
    store.merge('User', { id: '1', age: 30 }); // changed

    expect(updateCount).toBe(initialCount + 1);
  });

  it('merge wraps in batch (multiple entities = single reactive flush)', () => {
    const store = new EntityStore();

    let flushCount = 0;
    domEffect(() => {
      store.get<User>('User', '1').value;
      store.get<User>('User', '2').value;
      flushCount++;
    });

    const initialCount = flushCount;
    store.merge('User', [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);

    // Only one effect re-run despite two entity creations
    expect(flushCount).toBe(initialCount + 1);
  });

  it('merge with undefined fields does not overwrite existing fields', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice', age: 25 });
    store.merge('User', { id: '1', age: undefined });

    expect(store.get<User>('User', '1').value).toEqual({
      id: '1',
      name: 'Alice',
      age: 25,
    });
  });

  it('merge with empty array is no-op', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice' });
    store.merge('User', []);

    expect(store.size('User')).toBe(1);
    expect(store.get<User>('User', '1').value).toEqual({ id: '1', name: 'Alice' });
  });

  it('merge entity with array field replaces entire array', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice', tags: ['old', 'stale'] });
    store.merge('User', { id: '1', tags: ['new'] });

    expect(store.get<User>('User', '1').value?.tags).toEqual(['new']);
  });

  it('merge entity with nested object field replaces entire object', () => {
    const store = new EntityStore();
    store.merge('User', {
      id: '1',
      name: 'Alice',
      address: { city: 'SF', zip: '94102' },
    });
    store.merge('User', { id: '1', address: { city: 'NYC' } });

    expect(store.get<User>('User', '1').value?.address).toEqual({ city: 'NYC' });
  });

  it('merge called inside an effect does not cause infinite re-trigger', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice', age: 25 });

    let effectRuns = 0;
    domEffect(() => {
      const user = store.get<User>('User', '1').value;
      effectRuns++;

      if (user && user.age === 25) {
        // This merge should NOT re-trigger this effect
        store.merge('User', { id: '1', age: 30 });
      }
    });

    // Effect runs once initially, merge happens but doesn't re-trigger
    expect(effectRuns).toBeLessThan(5); // Not infinite
  });
});

describe('EntityStore - remove', () => {
  it('remove deletes entity signal', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice' });
    expect(store.has('User', '1')).toBe(true);

    store.remove('User', '1');

    expect(store.has('User', '1')).toBe(false);
    expect(store.get<User>('User', '1').value).toBeUndefined();
  });

  it('remove on missing entity is no-op', () => {
    const store = new EntityStore();
    expect(() => store.remove('User', '999')).not.toThrow();
  });

  it('remove triggers type change listeners', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice' });

    const listener = vi.fn();
    store.onTypeChange('User', listener);

    store.remove('User', '1');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('after remove, get returns undefined signal', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice' });
    const signal = store.get<User>('User', '1');

    store.remove('User', '1');

    expect(signal.value).toBeUndefined();
  });
});

describe('EntityStore - getMany', () => {
  it('returns signal of array matching IDs', () => {
    const store = new EntityStore();
    store.merge('User', [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
      { id: '3', name: 'Charlie' },
    ]);

    const signal = store.getMany<User>('User', ['1', '3']);

    expect(signal.value).toEqual([
      { id: '1', name: 'Alice' },
      { id: '3', name: 'Charlie' },
    ]);
  });

  it('array updates when underlying entities change', () => {
    const store = new EntityStore();
    store.merge('User', [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);

    const signal = store.getMany<User>('User', ['1', '2']);

    store.merge('User', { id: '1', name: 'Alicia' });

    expect(signal.value).toEqual([
      { id: '1', name: 'Alicia' },
      { id: '2', name: 'Bob' },
    ]);
  });

  it('missing IDs produce undefined in array', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice' });

    const signal = store.getMany<User>('User', ['1', '999', '2']);

    expect(signal.value).toEqual([{ id: '1', name: 'Alice' }, undefined, undefined]);
  });

  it('getMany with empty IDs array returns empty signal array', () => {
    const store = new EntityStore();
    const signal = store.getMany<User>('User', []);
    expect(signal.value).toEqual([]);
  });

  it('getMany repeated calls return independent computed signals', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice' });

    const signal1 = store.getMany<User>('User', ['1']);
    const signal2 = store.getMany<User>('User', ['1']);

    expect(signal1).not.toBe(signal2); // different instances
    expect(signal1.value).toEqual(signal2.value); // same values
  });
});

describe('EntityStore - onTypeChange', () => {
  it('fires on merge of new entity (create)', () => {
    const store = new EntityStore();
    const listener = vi.fn();
    store.onTypeChange('User', listener);

    store.merge('User', { id: '1', name: 'Alice' });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('fires on remove', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice' });

    const listener = vi.fn();
    store.onTypeChange('User', listener);

    store.remove('User', '1');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire on merge of existing entity (update)', () => {
    const store = new EntityStore();
    store.merge('User', { id: '1', name: 'Alice' });

    const listener = vi.fn();
    store.onTypeChange('User', listener);

    store.merge('User', { id: '1', name: 'Alicia' }); // update

    expect(listener).not.toHaveBeenCalled();
  });

  it('returns unsubscribe function that works', () => {
    const store = new EntityStore();
    const listener = vi.fn();
    const unsubscribe = store.onTypeChange('User', listener);

    unsubscribe();
    store.merge('User', { id: '1', name: 'Alice' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('multiple listeners on same type all fire', () => {
    const store = new EntityStore();
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    store.onTypeChange('User', listener1);
    store.onTypeChange('User', listener2);

    store.merge('User', { id: '1', name: 'Alice' });

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });
});

describe('EntityStore - optimistic layers', () => {
  it('applyLayer adds optimistic layer and updates visible state', () => {
    const store = new EntityStore();
    store.merge('todos', { id: '1', completed: false, title: 'Buy milk' });

    store.applyLayer('todos', '1', 'm1', { completed: true });

    expect(store.get('todos', '1').value).toEqual({
      id: '1',
      completed: true,
      title: 'Buy milk',
    });
  });

  it('rollbackLayer removes layer and reverts to base', () => {
    const store = new EntityStore();
    store.merge('todos', { id: '1', completed: false, title: 'Buy milk' });

    store.applyLayer('todos', '1', 'm1', { completed: true });
    expect(store.get('todos', '1').value).toEqual({
      id: '1',
      completed: true,
      title: 'Buy milk',
    });

    store.rollbackLayer('todos', '1', 'm1');
    expect(store.get('todos', '1').value).toEqual({
      id: '1',
      completed: false,
      title: 'Buy milk',
    });
  });

  it('commitLayer updates base with server data and removes layer', () => {
    const store = new EntityStore();
    store.merge('todos', { id: '1', completed: false, title: 'Buy milk' });

    store.applyLayer('todos', '1', 'm1', { completed: true });
    store.commitLayer('todos', '1', 'm1', {
      id: '1',
      completed: true,
      title: 'Buy milk',
      updatedAt: '2026-03-03',
    });

    expect(store.get('todos', '1').value).toEqual({
      id: '1',
      completed: true,
      title: 'Buy milk',
      updatedAt: '2026-03-03',
    });
  });

  it('handles concurrent mutations independently', () => {
    const store = new EntityStore();
    store.merge('todos', { id: '1', completed: false, title: 'Buy milk' });

    // Two concurrent mutations
    store.applyLayer('todos', '1', 'm1', { completed: true });
    store.applyLayer('todos', '1', 'm2', { title: 'Buy eggs' });

    // Both layers applied
    expect(store.get('todos', '1').value).toEqual({
      id: '1',
      completed: true,
      title: 'Buy eggs',
    });

    // Rollback m1 — m2 survives
    store.rollbackLayer('todos', '1', 'm1');
    expect(store.get('todos', '1').value).toEqual({
      id: '1',
      completed: false,
      title: 'Buy eggs',
    });

    // Commit m2 with server data
    store.commitLayer('todos', '1', 'm2', {
      id: '1',
      completed: false,
      title: 'Buy eggs',
      updatedAt: '2026-03-03',
    });
    expect(store.get('todos', '1').value).toEqual({
      id: '1',
      completed: false,
      title: 'Buy eggs',
      updatedAt: '2026-03-03',
    });
  });

  it('merge after applyLayer updates base but preserves layers', () => {
    const store = new EntityStore();
    store.merge('todos', { id: '1', completed: false, title: 'Buy milk' });

    // Optimistic layer says completed: true
    store.applyLayer('todos', '1', 'm1', { completed: true });

    // Server refetch returns stale data (completed: false)
    store.merge('todos', { id: '1', completed: false, title: 'Buy milk', updatedAt: '2026-01-01' });

    // Layer still applied on top — visible shows completed: true
    expect(store.get('todos', '1').value).toEqual({
      id: '1',
      completed: true,
      title: 'Buy milk',
      updatedAt: '2026-01-01',
    });
  });

  it('removeOptimistic removes entity and updates query indices', () => {
    const store = new EntityStore();
    store.merge('todos', [
      { id: '1', title: 'A' },
      { id: '2', title: 'B' },
      { id: '3', title: 'C' },
    ]);
    // Simulate query index registration (via public queryIndices accessor)
    store.queryIndices.set('GET:/todos', ['1', '2', '3']);

    store.removeOptimistic('todos', '2', 'm1');

    expect(store.has('todos', '2')).toBe(false);
    expect(store.queryIndices.get('GET:/todos')).toEqual(['1', '3']);
  });

  it('restoreOptimistic restores entity and query indices after failed delete', () => {
    const store = new EntityStore();
    store.merge('todos', [
      { id: '1', title: 'A' },
      { id: '2', title: 'B' },
      { id: '3', title: 'C' },
    ]);
    store.queryIndices.set('GET:/todos', ['1', '2', '3']);

    // Snapshot before delete
    const entitySnapshot = store.get('todos', '2').peek();
    const indexSnapshot = store.queryIndices.snapshotEntity('2');

    // Optimistic delete
    store.removeOptimistic('todos', '2', 'm1');
    expect(store.queryIndices.get('GET:/todos')).toEqual(['1', '3']);

    // Rollback
    store.restoreOptimistic('todos', '2', 'm1', entitySnapshot, indexSnapshot);
    expect(store.queryIndices.get('GET:/todos')).toEqual(['1', '2', '3']);
    expect(store.get('todos', '2').value).toEqual({ id: '2', title: 'B' });
  });

  it('inspect returns base, layers, visible state, refCount and orphanedAt', () => {
    const store = new EntityStore();
    store.merge('todos', { id: '1', completed: false, title: 'Buy milk' });
    store.applyLayer('todos', '1', 'm1', { completed: true });

    const state = store.inspect('todos', '1');

    expect(state).toEqual({
      base: { id: '1', completed: false, title: 'Buy milk' },
      layers: new Map([['m1', { completed: true }]]),
      visible: { id: '1', completed: true, title: 'Buy milk' },
      refCount: 0,
      orphanedAt: null,
    });
  });

  it('inspect returns undefined for missing entity', () => {
    const store = new EntityStore();
    expect(store.inspect('todos', '999')).toBeUndefined();
  });

  it('layer operations on missing entities are safe no-ops', () => {
    const store = new EntityStore();
    expect(() => store.applyLayer('todos', '999', 'm1', { a: 1 })).not.toThrow();
    expect(() => store.rollbackLayer('todos', '999', 'm1')).not.toThrow();
    expect(() => store.commitLayer('todos', '999', 'm1', { a: 1 })).not.toThrow();
  });
});

describe('EntityStore - edge cases', () => {
  it('multiple entity types coexist without interference', () => {
    const store = new EntityStore();

    store.merge('User', { id: '1', name: 'Alice' });
    store.merge('Post', { id: '1', title: 'Hello', authorId: '1' });

    expect(store.get<User>('User', '1').value).toEqual({ id: '1', name: 'Alice' });
    expect(store.get<Post>('Post', '1').value).toEqual({
      id: '1',
      title: 'Hello',
      authorId: '1',
    });
  });

  it('merge inside existing batch coalesces correctly', async () => {
    const store = new EntityStore();

    let effectRuns = 0;
    domEffect(() => {
      store.get<User>('User', '1').value;
      store.get<User>('User', '2').value;
      effectRuns++;
    });

    const initialRuns = effectRuns;

    // Manual batch wrapping the merge (which also batches internally)
    const { batch } = await import('../../runtime/scheduler');
    batch(() => {
      store.merge('User', { id: '1', name: 'Alice' });
      store.merge('User', { id: '2', name: 'Bob' });
    });

    // Should still only trigger one effect run
    expect(effectRuns).toBe(initialRuns + 1);
  });
});

describe('EntityStore - deep normalization', () => {
  afterEach(() => {
    resetRelationSchemas_TEST_ONLY();
  });

  it('merge extracts nested one-relation and stores both entities', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const store = new EntityStore();
    store.merge('posts', {
      id: 'p1',
      title: 'Hello',
      author: { id: 'u1', name: 'John' },
    });

    // Post stored with bare ID
    expect(store.get('posts', 'p1').value).toEqual({
      id: 'p1',
      title: 'Hello',
      author: 'u1',
    });
    // Author extracted into users bucket
    expect(store.get('users', 'u1').value).toEqual({
      id: 'u1',
      name: 'John',
    });
  });

  it('merge with multiple posts sharing same author merges author once', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const store = new EntityStore();
    store.merge('posts', [
      { id: 'p1', title: 'Post 1', author: { id: 'u1', name: 'John' } },
      { id: 'p2', title: 'Post 2', author: { id: 'u1', name: 'John' } },
    ]);

    expect(store.get('posts', 'p1').value).toEqual({
      id: 'p1',
      title: 'Post 1',
      author: 'u1',
    });
    expect(store.get('posts', 'p2').value).toEqual({
      id: 'p2',
      title: 'Post 2',
      author: 'u1',
    });
    expect(store.size('users')).toBe(1);
  });

  it('merge without schema stores entities as-is (backward compat)', () => {
    const store = new EntityStore();
    store.merge('posts', {
      id: 'p1',
      title: 'Hello',
      author: { id: 'u1', name: 'John' },
    });

    // Stored as-is since no schema registered
    expect(store.get('posts', 'p1').value).toEqual({
      id: 'p1',
      title: 'Hello',
      author: { id: 'u1', name: 'John' },
    });
  });

  it('merge with already-bare ID leaves field unchanged', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const store = new EntityStore();
    store.merge('posts', { id: 'p1', title: 'Hello', author: 'u1' });

    expect(store.get('posts', 'p1').value).toEqual({
      id: 'p1',
      title: 'Hello',
      author: 'u1',
    });
  });

  it('merge with many-relation extracts nested array', () => {
    registerRelationSchema('posts', {
      tags: { type: 'many', entity: 'tags' },
    });

    const store = new EntityStore();
    store.merge('posts', {
      id: 'p1',
      title: 'Hello',
      tags: [
        { id: 't1', name: 'TS' },
        { id: 't2', name: 'Bun' },
      ],
    });

    expect(store.get('posts', 'p1').value).toEqual({
      id: 'p1',
      title: 'Hello',
      tags: ['t1', 't2'],
    });
    expect(store.get('tags', 't1').value).toEqual({ id: 't1', name: 'TS' });
    expect(store.get('tags', 't2').value).toEqual({ id: 't2', name: 'Bun' });
  });

  it('re-merge with identical normalized data does NOT trigger signal update', () => {
    registerRelationSchema('posts', {
      tags: { type: 'many', entity: 'tags' },
    });

    const store = new EntityStore();
    store.merge('posts', {
      id: 'p1',
      title: 'Hello',
      tags: [{ id: 't1', name: 'TS' }],
    });

    const postSignal = store.get('posts', 'p1');
    let updateCount = 0;
    domEffect(() => {
      postSignal.value;
      updateCount++;
    });

    const initialCount = updateCount;
    // Re-merge same data — should not trigger update
    store.merge('posts', {
      id: 'p1',
      title: 'Hello',
      tags: [{ id: 't1', name: 'TS' }],
    });

    expect(updateCount).toBe(initialCount);
  });

  it('commitLayer normalizes server response', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const store = new EntityStore();
    store.merge('posts', { id: 'p1', title: 'Draft', author: 'u1' });
    store.merge('users', { id: 'u1', name: 'John' });

    store.applyLayer('posts', 'p1', 'm1', { title: 'Published' });
    store.commitLayer('posts', 'p1', 'm1', {
      id: 'p1',
      title: 'Published',
      author: { id: 'u1', name: 'John Updated' },
    });

    // Base should be normalized
    const state = store.inspect('posts', 'p1');
    expect(state?.base).toEqual({
      id: 'p1',
      title: 'Published',
      author: 'u1',
    });
    // Nested entity updated
    expect(store.get('users', 'u1').value).toEqual({
      id: 'u1',
      name: 'John Updated',
    });
  });

  it('deep nesting via merge: post → author → org', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });
    registerRelationSchema('users', {
      organization: { type: 'one', entity: 'orgs' },
    });

    const store = new EntityStore();
    store.merge('posts', {
      id: 'p1',
      title: 'Hello',
      author: {
        id: 'u1',
        name: 'John',
        organization: { id: 'o1', name: 'Acme' },
      },
    });

    expect(store.get('posts', 'p1').value).toEqual({
      id: 'p1',
      title: 'Hello',
      author: 'u1',
    });
    expect(store.get('users', 'u1').value).toEqual({
      id: 'u1',
      name: 'John',
      organization: 'o1',
    });
    expect(store.get('orgs', 'o1').value).toEqual({
      id: 'o1',
      name: 'Acme',
    });
  });
});

describe('EntityStore - reference counting', () => {
  it('addRef increments refCount from 0 to 1', () => {
    const store = new EntityStore();
    store.merge('users', { id: 'u1', name: 'John' });

    store.addRef('users', 'u1');

    const state = store.inspect('users', 'u1');
    expect(state?.refCount).toBe(1);
  });

  it('addRef called twice increments to 2', () => {
    const store = new EntityStore();
    store.merge('users', { id: 'u1', name: 'John' });

    store.addRef('users', 'u1');
    store.addRef('users', 'u1');

    expect(store.inspect('users', 'u1')?.refCount).toBe(2);
  });

  it('addRef clears orphanedAt', () => {
    const store = new EntityStore();
    store.merge('users', { id: 'u1', name: 'John' });

    store.addRef('users', 'u1');
    store.removeRef('users', 'u1'); // sets orphanedAt
    expect(store.inspect('users', 'u1')?.orphanedAt).not.toBeNull();

    store.addRef('users', 'u1'); // clears orphanedAt
    expect(store.inspect('users', 'u1')?.orphanedAt).toBeNull();
  });

  it('addRef on non-existent entity is a no-op', () => {
    const store = new EntityStore();
    expect(() => store.addRef('users', 'u999')).not.toThrow();
  });

  it('removeRef decrements refCount from 1 to 0', () => {
    const store = new EntityStore();
    store.merge('users', { id: 'u1', name: 'John' });

    store.addRef('users', 'u1');
    store.removeRef('users', 'u1');

    expect(store.inspect('users', 'u1')?.refCount).toBe(0);
  });

  it('removeRef sets orphanedAt when refCount reaches 0', () => {
    const store = new EntityStore();
    store.merge('users', { id: 'u1', name: 'John' });

    store.addRef('users', 'u1');
    store.removeRef('users', 'u1');

    const state = store.inspect('users', 'u1');
    expect(state?.orphanedAt).toBeNumber();
  });

  it('removeRef never goes below 0', () => {
    const store = new EntityStore();
    store.merge('users', { id: 'u1', name: 'John' });

    store.removeRef('users', 'u1');
    store.removeRef('users', 'u1');

    expect(store.inspect('users', 'u1')?.refCount).toBe(0);
  });

  it('removeRef on non-existent entity is a no-op', () => {
    const store = new EntityStore();
    expect(() => store.removeRef('users', 'u999')).not.toThrow();
  });

  it('removeRef on entity with refCount > 1 does NOT set orphanedAt', () => {
    const store = new EntityStore();
    store.merge('users', { id: 'u1', name: 'John' });

    store.addRef('users', 'u1');
    store.addRef('users', 'u1');
    store.removeRef('users', 'u1');

    const state = store.inspect('users', 'u1');
    expect(state?.refCount).toBe(1);
    expect(state?.orphanedAt).toBeNull();
  });

  it('inspect returns refCount and orphanedAt fields', () => {
    const store = new EntityStore();
    store.merge('users', { id: 'u1', name: 'John' });

    const state = store.inspect('users', 'u1');
    expect(state?.refCount).toBe(0);
    expect(state?.orphanedAt).toBeNull();
  });

  it('new entities created via merge have refCount=0, orphanedAt=null', () => {
    const store = new EntityStore();
    store.merge('users', { id: 'u1', name: 'John' });

    const state = store.inspect('users', 'u1');
    expect(state?.refCount).toBe(0);
    expect(state?.orphanedAt).toBeNull();
  });

  it('new entries created via get (missing entity) have refCount=0, orphanedAt=null', () => {
    const store = new EntityStore();
    store.get('users', 'u999'); // creates placeholder

    const state = store.inspect('users', 'u999');
    expect(state?.refCount).toBe(0);
    expect(state?.orphanedAt).toBeNull();
  });
});

describe('EntityStore - evictOrphans', () => {
  it('evicts entities with refCount=0 and orphanedAt set (maxAge=0)', () => {
    const store = new EntityStore();
    store.merge('users', { id: 'u1', name: 'John' });
    store.addRef('users', 'u1');
    store.removeRef('users', 'u1'); // orphaned

    const count = store.evictOrphans(0);

    expect(count).toBe(1);
    expect(store.has('users', 'u1')).toBe(false);
  });

  it('respects maxAge — only evicts entities orphaned longer than maxAge', () => {
    const store = new EntityStore();
    store.merge('users', { id: 'u1', name: 'John' });
    store.addRef('users', 'u1');
    store.removeRef('users', 'u1'); // orphaned just now

    // maxAge = 60 seconds, entity just orphaned — should NOT be evicted
    const count = store.evictOrphans(60_000);

    expect(count).toBe(0);
    expect(store.has('users', 'u1')).toBe(true);
  });

  it('never evicts entities with refCount > 0', () => {
    const store = new EntityStore();
    store.merge('users', { id: 'u1', name: 'John' });
    store.addRef('users', 'u1');

    const count = store.evictOrphans(0);

    expect(count).toBe(0);
    expect(store.has('users', 'u1')).toBe(true);
  });

  it('never evicts entities with pending optimistic layers', () => {
    const store = new EntityStore();
    store.merge('users', { id: 'u1', name: 'John' });
    store.addRef('users', 'u1');
    store.removeRef('users', 'u1'); // orphaned
    store.applyLayer('users', 'u1', 'm1', { name: 'Jane' }); // has layer

    const count = store.evictOrphans(0);

    expect(count).toBe(0);
    expect(store.has('users', 'u1')).toBe(true);
  });

  it('sets evicted entity signal to undefined', () => {
    const store = new EntityStore();
    store.merge('users', { id: 'u1', name: 'John' });
    const sig = store.get('users', 'u1');
    store.addRef('users', 'u1');
    store.removeRef('users', 'u1');

    store.evictOrphans(0);

    expect(sig.value).toBeUndefined();
  });

  it('removes evicted entity from query indices', () => {
    const store = new EntityStore();
    store.merge('users', [
      { id: 'u1', name: 'John' },
      { id: 'u2', name: 'Jane' },
    ]);
    store.queryIndices.set('GET:/users', ['u1', 'u2']);

    store.addRef('users', 'u1');
    store.removeRef('users', 'u1'); // orphan u1
    store.addRef('users', 'u2'); // u2 still referenced

    store.evictOrphans(0);

    expect(store.queryIndices.get('GET:/users')).toEqual(['u2']);
  });

  it('returns count of evicted entities', () => {
    const store = new EntityStore();
    store.merge('users', [
      { id: 'u1', name: 'John' },
      { id: 'u2', name: 'Jane' },
      { id: 'u3', name: 'Bob' },
    ]);

    store.addRef('users', 'u1');
    store.removeRef('users', 'u1'); // orphan
    store.addRef('users', 'u2');
    store.removeRef('users', 'u2'); // orphan
    store.addRef('users', 'u3'); // still referenced

    expect(store.evictOrphans(0)).toBe(2);
  });

  it('returns 0 on empty store', () => {
    const store = new EntityStore();
    expect(store.evictOrphans(0)).toBe(0);
  });
});

describe('EntityStore - on-demand eviction during merge', () => {
  it('merge() evicts orphaned entities that exceed maxAge', () => {
    const originalNow = Date.now;
    let mockTime = originalNow();
    Date.now = () => mockTime;

    try {
      const store = new EntityStore();
      store.merge('users', { id: 'u1', name: 'John' });
      store.addRef('users', 'u1');
      store.removeRef('users', 'u1'); // orphanedAt = mockTime

      // Advance time past maxAge (5 min)
      mockTime += 300_001;

      // Merge a new entity — should trigger eviction of u1
      store.merge('users', { id: 'u2', name: 'Jane' });

      expect(store.has('users', 'u1')).toBe(false); // evicted during merge
      expect(store.has('users', 'u2')).toBe(true); // newly merged
    } finally {
      Date.now = originalNow;
    }
  });

  it('merge() does not evict entities still within maxAge', () => {
    const store = new EntityStore();
    store.merge('users', { id: 'u1', name: 'John' });
    store.addRef('users', 'u1');
    store.removeRef('users', 'u1'); // orphaned just now

    // Merge immediately — u1 orphaned < 5 min ago, should survive
    store.merge('users', { id: 'u2', name: 'Jane' });

    expect(store.has('users', 'u1')).toBe(true); // too young to evict
    expect(store.has('users', 'u2')).toBe(true);
  });

  it('merge() does not evict entities with active refs', () => {
    const originalNow = Date.now;
    let mockTime = originalNow();
    Date.now = () => mockTime;

    try {
      const store = new EntityStore();
      store.merge('users', { id: 'u1', name: 'John' });
      store.addRef('users', 'u1'); // actively referenced

      mockTime += 600_000; // well past maxAge

      store.merge('users', { id: 'u2', name: 'Jane' });

      expect(store.has('users', 'u1')).toBe(true); // still referenced — protected
      expect(store.has('users', 'u2')).toBe(true);
    } finally {
      Date.now = originalNow;
    }
  });

  it('merge() does not evict entities with pending optimistic layers', () => {
    const originalNow = Date.now;
    let mockTime = originalNow();
    Date.now = () => mockTime;

    try {
      const store = new EntityStore();
      store.merge('users', { id: 'u1', name: 'John' });
      store.addRef('users', 'u1');
      store.removeRef('users', 'u1'); // orphaned
      store.applyLayer('users', 'u1', 'm1', { name: 'Jane' }); // optimistic layer

      mockTime += 600_000;

      store.merge('users', { id: 'u2', name: 'Bob' });

      expect(store.has('users', 'u1')).toBe(true); // has pending layer — protected
      expect(store.has('users', 'u2')).toBe(true);
    } finally {
      Date.now = originalNow;
    }
  });

  it('merge() evicts across multiple entity types', () => {
    const originalNow = Date.now;
    let mockTime = originalNow();
    Date.now = () => mockTime;

    try {
      const store = new EntityStore();
      store.merge('users', { id: 'u1', name: 'John' });
      store.merge('posts', { id: 'p1', title: 'Hello' });
      store.addRef('users', 'u1');
      store.removeRef('users', 'u1');
      store.addRef('posts', 'p1');
      store.removeRef('posts', 'p1');

      mockTime += 300_001;

      store.merge('comments', { id: 'c1', body: 'Nice' });

      expect(store.has('users', 'u1')).toBe(false); // evicted
      expect(store.has('posts', 'p1')).toBe(false); // evicted
      expect(store.has('comments', 'c1')).toBe(true); // newly merged
    } finally {
      Date.now = originalNow;
    }
  });

  it('all existing evictOrphans tests still pass (backward compat)', () => {
    // This test documents that merge() calling evictOrphans() doesn't
    // break existing behavior — entities that were never ref'd are not
    // evicted (orphanedAt is null for never-ref'd entities).
    const store = new EntityStore();
    store.merge('users', { id: 'u1', name: 'John' });

    // Merge again — u1 was never addRef'd/removeRef'd, orphanedAt is null
    store.merge('users', { id: 'u2', name: 'Jane' });

    expect(store.has('users', 'u1')).toBe(true); // never orphaned — survives
  });
});

describe('EntityStore - field selection tracking', () => {
  it('mergeWithSelect registers select fields and wraps entities in dev proxies', () => {
    const store = new EntityStore({ devMode: true });
    store.mergeWithSelect('users', [{ id: 'u1', name: 'Alice', email: 'a@test.com' }], {
      fields: ['id', 'name', 'email'],
      querySource: 'GET:/users',
    });

    const sig = store.get<{ id: string; name: string; bio?: string }>('users', 'u1');
    const entity = sig.value!;

    // Access selected field — no warning
    const warnSpy = vi.fn();
    const originalWarn = console.warn;
    console.warn = warnSpy;

    try {
      expect(entity.name).toBe('Alice');
      expect(warnSpy).not.toHaveBeenCalled();

      // Access non-selected field — warning
      const _bio = entity.bio;
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('bio');
    } finally {
      console.warn = originalWarn;
    }
  });

  it('does not wrap entities in dev proxies when devMode is false', () => {
    const store = new EntityStore({ devMode: false });
    store.mergeWithSelect('users', [{ id: 'u1', name: 'Alice' }], {
      fields: ['id', 'name'],
      querySource: 'GET:/users',
    });

    const sig = store.get<{ id: string; name: string; bio?: string }>('users', 'u1');
    const entity = sig.value!;

    const warnSpy = vi.fn();
    const originalWarn = console.warn;
    console.warn = warnSpy;

    try {
      const _bio = entity.bio;
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      console.warn = originalWarn;
    }
  });

  it('regular merge does not trigger field selection warnings', () => {
    const store = new EntityStore({ devMode: true });
    store.merge('users', { id: 'u1', name: 'Alice' });

    const sig = store.get<{ id: string; name: string; bio?: string }>('users', 'u1');
    const entity = sig.value!;

    const warnSpy = vi.fn();
    const originalWarn = console.warn;
    console.warn = warnSpy;

    try {
      const _bio = entity.bio;
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      console.warn = originalWarn;
    }
  });

  it('merging unchanged data with select tracking does NOT produce spurious warnings', () => {
    const store = new EntityStore({ devMode: true });
    store.mergeWithSelect('users', [{ id: 'u1', name: 'Alice' }], {
      fields: ['id', 'name'],
      querySource: 'GET:/users',
    });

    const warnSpy = vi.fn();
    const originalWarn = console.warn;
    console.warn = warnSpy;

    try {
      // Merge the same data again — should not produce any warnings
      store.mergeWithSelect('users', [{ id: 'u1', name: 'Alice' }], {
        fields: ['id', 'name'],
        querySource: 'GET:/users',
      });
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      console.warn = originalWarn;
    }
  });

  it('Proxy works correctly after applyLayer + rollbackLayer', () => {
    const store = new EntityStore({ devMode: true });
    store.mergeWithSelect('users', [{ id: 'u1', name: 'Alice', email: 'a@test.com' }], {
      fields: ['id', 'name', 'email'],
      querySource: 'GET:/users',
    });

    // Apply optimistic layer
    store.applyLayer('users', 'u1', 'mut-1', { name: 'Bob' });

    const sig = store.get<{ id: string; name: string; bio?: string }>('users', 'u1');
    expect(sig.value!.name).toBe('Bob');

    const warnSpy = vi.fn();
    const originalWarn = console.warn;
    console.warn = warnSpy;

    try {
      // Access non-selected field on optimistic entity
      const _bio = sig.value!.bio;
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      console.warn = originalWarn;
    }

    // Rollback — entity reverts
    store.rollbackLayer('users', 'u1', 'mut-1');
    expect(sig.value!.name).toBe('Alice');
  });

  it('Proxy works correctly after commitLayer with server data', () => {
    const store = new EntityStore({ devMode: true });
    store.mergeWithSelect('users', [{ id: 'u1', name: 'Alice' }], {
      fields: ['id', 'name'],
      querySource: 'GET:/users',
    });

    store.applyLayer('users', 'u1', 'mut-1', { name: 'Bob' });
    store.commitLayer('users', 'u1', 'mut-1', { id: 'u1', name: 'Bob' });

    const sig = store.get<{ id: string; name: string; bio?: string }>('users', 'u1');
    expect(sig.value!.name).toBe('Bob');

    const warnSpy = vi.fn();
    const originalWarn = console.warn;
    console.warn = warnSpy;

    try {
      const _bio = sig.value!.bio;
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      console.warn = originalWarn;
    }
  });
});
