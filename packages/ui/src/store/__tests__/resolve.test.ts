import { afterEach, describe, expect, it } from 'bun:test';
import { computed } from '../../runtime/signal';
import { EntityStore } from '../entity-store';
import { registerRelationSchema, resetRelationSchemas_TEST_ONLY } from '../relation-registry';
import { resolveReferences } from '../resolve';

describe('resolveReferences', () => {
  afterEach(() => {
    resetRelationSchemas_TEST_ONLY();
  });

  it('returns entity unchanged when no schema is registered', () => {
    const store = new EntityStore();
    const entity = { id: 'p1', title: 'Hello' };

    const result = resolveReferences(entity, 'posts', store);
    expect(result).toBe(entity);
  });

  it('resolves one-relation bare ID to full entity object', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const store = new EntityStore();
    store.merge('users', { id: 'u1', name: 'John' });

    const entity = { id: 'p1', title: 'Hello', author: 'u1' };
    const result = resolveReferences(entity, 'posts', store);

    expect(result).toEqual({
      id: 'p1',
      title: 'Hello',
      author: { id: 'u1', name: 'John' },
    });
  });

  it('resolves one-relation pointing to missing entity as null', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const store = new EntityStore();
    const entity = { id: 'p1', title: 'Hello', author: 'u1' };
    const result = resolveReferences(entity, 'posts', store);

    expect(result).toEqual({
      id: 'p1',
      title: 'Hello',
      author: null,
    });
  });

  it('resolves many-relation array of IDs to entity objects', () => {
    registerRelationSchema('posts', {
      tags: { type: 'many', entity: 'tags' },
    });

    const store = new EntityStore();
    store.merge('tags', [
      { id: 't1', name: 'TS' },
      { id: 't2', name: 'Bun' },
    ]);

    const entity = { id: 'p1', title: 'Hello', tags: ['t1', 't2'] };
    const result = resolveReferences(entity, 'posts', store);

    expect(result).toEqual({
      id: 'p1',
      title: 'Hello',
      tags: [
        { id: 't1', name: 'TS' },
        { id: 't2', name: 'Bun' },
      ],
    });
  });

  it('filters out missing entities in many-relation', () => {
    registerRelationSchema('posts', {
      tags: { type: 'many', entity: 'tags' },
    });

    const store = new EntityStore();
    store.merge('tags', { id: 't1', name: 'TS' });

    const entity = { id: 'p1', title: 'Hello', tags: ['t1', 't2'] };
    const result = resolveReferences(entity, 'posts', store);

    expect(result).toEqual({
      id: 'p1',
      title: 'Hello',
      tags: [{ id: 't1', name: 'TS' }],
    });
  });

  it('resolves deep nesting: post → author → organization', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });
    registerRelationSchema('users', {
      organization: { type: 'one', entity: 'orgs' },
    });

    const store = new EntityStore();
    store.merge('users', { id: 'u1', name: 'John', organization: 'o1' });
    store.merge('orgs', { id: 'o1', name: 'Acme' });

    const entity = { id: 'p1', title: 'Hello', author: 'u1' };
    const result = resolveReferences(entity, 'posts', store);

    expect(result).toEqual({
      id: 'p1',
      title: 'Hello',
      author: {
        id: 'u1',
        name: 'John',
        organization: { id: 'o1', name: 'Acme' },
      },
    });
  });

  it('handles cycles without infinite loop', () => {
    registerRelationSchema('users', {
      bestFriend: { type: 'one', entity: 'users' },
    });

    const store = new EntityStore();
    store.merge('users', [
      { id: 'u1', name: 'John', bestFriend: 'u2' },
      { id: 'u2', name: 'Jane', bestFriend: 'u1' },
    ]);

    const entity = { id: 'u1', name: 'John', bestFriend: 'u2' };
    const result = resolveReferences(entity, 'users', store);

    // u1 resolves u2, u2 tries to resolve u1 but cycle detected
    expect(result.id).toBe('u1');
    const friend = result.bestFriend as Record<string, unknown>;
    expect(friend.id).toBe('u2');
    expect(friend.name).toBe('Jane');
    // u2's bestFriend should be the raw entity (cycle stops recursion)
  });

  it('preserves non-relation fields unchanged', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const store = new EntityStore();
    store.merge('users', { id: 'u1', name: 'John' });

    const entity = { id: 'p1', title: 'Hello', views: 42, author: 'u1' };
    const result = resolveReferences(entity, 'posts', store);

    expect(result.title).toBe('Hello');
    expect(result.views).toBe(42);
  });

  it('passes through already-denormalized field (object, not string)', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const store = new EntityStore();
    const entity = {
      id: 'p1',
      title: 'Hello',
      author: { id: 'u1', name: 'John' },
    };
    const result = resolveReferences(entity, 'posts', store);

    expect(result.author).toEqual({ id: 'u1', name: 'John' });
  });

  it('collects refKeys for current entity', () => {
    const store = new EntityStore();
    const entity = { id: 'p1', title: 'Hello' };
    const refKeys = new Set<string>();

    resolveReferences(entity, 'posts', store, undefined, refKeys);

    expect(refKeys.has('posts:p1')).toBe(true);
  });

  it('collects refKeys for one-relation entities', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const store = new EntityStore();
    store.merge('users', { id: 'u1', name: 'John' });

    const entity = { id: 'p1', title: 'Hello', author: 'u1' };
    const refKeys = new Set<string>();

    resolveReferences(entity, 'posts', store, undefined, refKeys);

    expect(refKeys.has('posts:p1')).toBe(true);
    expect(refKeys.has('users:u1')).toBe(true);
  });

  it('collects refKeys for many-relation entities', () => {
    registerRelationSchema('posts', {
      tags: { type: 'many', entity: 'tags' },
    });

    const store = new EntityStore();
    store.merge('tags', [
      { id: 't1', name: 'TS' },
      { id: 't2', name: 'Bun' },
    ]);

    const entity = { id: 'p1', title: 'Hello', tags: ['t1', 't2'] };
    const refKeys = new Set<string>();

    resolveReferences(entity, 'posts', store, undefined, refKeys);

    expect(refKeys.has('posts:p1')).toBe(true);
    expect(refKeys.has('tags:t1')).toBe(true);
    expect(refKeys.has('tags:t2')).toBe(true);
  });

  it('collects transitive refKeys (post → author → org)', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });
    registerRelationSchema('users', {
      organization: { type: 'one', entity: 'orgs' },
    });

    const store = new EntityStore();
    store.merge('users', { id: 'u1', name: 'John', organization: 'o1' });
    store.merge('orgs', { id: 'o1', name: 'Acme' });

    const entity = { id: 'p1', title: 'Hello', author: 'u1' };
    const refKeys = new Set<string>();

    resolveReferences(entity, 'posts', store, undefined, refKeys);

    expect(refKeys.has('posts:p1')).toBe(true);
    expect(refKeys.has('users:u1')).toBe(true);
    expect(refKeys.has('orgs:o1')).toBe(true);
  });

  it('works without refKeys parameter', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const store = new EntityStore();
    store.merge('users', { id: 'u1', name: 'John' });

    const entity = { id: 'p1', title: 'Hello', author: 'u1' };
    // Should not throw when refKeys is omitted
    const result = resolveReferences(entity, 'posts', store);

    expect(result.author).toEqual({ id: 'u1', name: 'John' });
  });

  it('creates reactive dependency via store.get().value', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const store = new EntityStore();
    store.merge('posts', { id: 'p1', title: 'Hello', author: 'u1' });
    store.merge('users', { id: 'u1', name: 'John' });

    const resolved = computed(() => {
      const post = store.get('posts', 'p1').value as Record<string, unknown>;
      if (!post) return undefined;
      return resolveReferences(post, 'posts', store);
    });

    expect((resolved.value as Record<string, unknown>).author).toEqual({
      id: 'u1',
      name: 'John',
    });

    // Update the referenced user
    store.merge('users', { id: 'u1', name: 'Jane' });

    // Computed re-evaluates with updated author
    expect((resolved.value as Record<string, unknown>).author).toEqual({
      id: 'u1',
      name: 'Jane',
    });
  });
});
