import { afterEach, describe, expect, it, vi } from 'bun:test';
import { normalizeEntity } from '../normalize';
import { registerRelationSchema, resetRelationSchemas_TEST_ONLY } from '../relation-registry';

describe('normalizeEntity', () => {
  afterEach(() => {
    resetRelationSchemas_TEST_ONLY();
  });

  it('returns flat entity unchanged when no schema is registered', () => {
    const entity = { id: 'p1', title: 'Hello' };
    const result = normalizeEntity('posts', entity);

    expect(result.normalized).toBe(entity);
    expect(result.extracted.size).toBe(0);
  });

  it('returns entity unchanged when schema exists but no relation fields in data', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const entity = { id: 'p1', title: 'Hello' };
    const result = normalizeEntity('posts', entity);

    expect(result.normalized).toEqual({ id: 'p1', title: 'Hello' });
    expect(result.extracted.size).toBe(0);
  });

  it('extracts one-relation nested object and replaces with ID', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const entity = {
      id: 'p1',
      title: 'Hello',
      author: { id: 'u1', name: 'John' },
    };
    const result = normalizeEntity('posts', entity);

    expect(result.normalized).toEqual({
      id: 'p1',
      title: 'Hello',
      author: 'u1',
    });
    expect(result.extracted.get('users')).toEqual([{ id: 'u1', name: 'John' }]);
  });

  it('leaves one-relation field as-is when already a string', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const entity = { id: 'p1', title: 'Hello', author: 'u1' };
    const result = normalizeEntity('posts', entity);

    expect(result.normalized).toEqual({
      id: 'p1',
      title: 'Hello',
      author: 'u1',
    });
    expect(result.extracted.size).toBe(0);
  });

  it('leaves one-relation field as-is when null', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const entity = { id: 'p1', title: 'Hello', author: null };
    const result = normalizeEntity('posts', entity);

    expect(result.normalized).toEqual({
      id: 'p1',
      title: 'Hello',
      author: null,
    });
    expect(result.extracted.size).toBe(0);
  });

  it('leaves one-relation nested object without string id as-is', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const entity = {
      id: 'p1',
      title: 'Hello',
      author: { name: 'John' }, // no id
    };
    const result = normalizeEntity('posts', entity);

    expect(result.normalized).toEqual({
      id: 'p1',
      title: 'Hello',
      author: { name: 'John' },
    });
    expect(result.extracted.size).toBe(0);
  });

  it('extracts many-relation array of objects and replaces with ID array', () => {
    registerRelationSchema('posts', {
      tags: { type: 'many', entity: 'tags' },
    });

    const entity = {
      id: 'p1',
      title: 'Hello',
      tags: [
        { id: 't1', name: 'TypeScript' },
        { id: 't2', name: 'Bun' },
      ],
    };
    const result = normalizeEntity('posts', entity);

    expect(result.normalized).toEqual({
      id: 'p1',
      title: 'Hello',
      tags: ['t1', 't2'],
    });
    expect(result.extracted.get('tags')).toEqual([
      { id: 't1', name: 'TypeScript' },
      { id: 't2', name: 'Bun' },
    ]);
  });

  it('leaves many-relation array of strings as-is', () => {
    registerRelationSchema('posts', {
      tags: { type: 'many', entity: 'tags' },
    });

    const entity = { id: 'p1', title: 'Hello', tags: ['t1', 't2'] };
    const result = normalizeEntity('posts', entity);

    expect(result.normalized).toEqual({
      id: 'p1',
      title: 'Hello',
      tags: ['t1', 't2'],
    });
    expect(result.extracted.size).toBe(0);
  });

  it('handles many-relation mixed array (objects and strings)', () => {
    registerRelationSchema('posts', {
      tags: { type: 'many', entity: 'tags' },
    });

    const entity = {
      id: 'p1',
      title: 'Hello',
      tags: ['t1', { id: 't2', name: 'Bun' }],
    };
    const result = normalizeEntity('posts', entity);

    expect(result.normalized).toEqual({
      id: 'p1',
      title: 'Hello',
      tags: ['t1', 't2'],
    });
    expect(result.extracted.get('tags')).toEqual([{ id: 't2', name: 'Bun' }]);
  });

  it('leaves many-relation field as-is when null', () => {
    registerRelationSchema('posts', {
      tags: { type: 'many', entity: 'tags' },
    });

    const entity = { id: 'p1', title: 'Hello', tags: null };
    const result = normalizeEntity('posts', entity);

    expect(result.normalized).toEqual({
      id: 'p1',
      title: 'Hello',
      tags: null,
    });
    expect(result.extracted.size).toBe(0);
  });

  it('handles deep nesting: post → author → organization', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });
    registerRelationSchema('users', {
      organization: { type: 'one', entity: 'orgs' },
    });

    const entity = {
      id: 'p1',
      title: 'Hello',
      author: {
        id: 'u1',
        name: 'John',
        organization: { id: 'o1', name: 'Acme' },
      },
    };
    const result = normalizeEntity('posts', entity);

    expect(result.normalized).toEqual({
      id: 'p1',
      title: 'Hello',
      author: 'u1',
    });
    expect(result.extracted.get('users')).toEqual([{ id: 'u1', name: 'John', organization: 'o1' }]);
    expect(result.extracted.get('orgs')).toEqual([{ id: 'o1', name: 'Acme' }]);
  });

  it('detects cycles and avoids infinite loop', () => {
    registerRelationSchema('users', {
      bestFriend: { type: 'one', entity: 'users' },
    });

    const entity = {
      id: 'u1',
      name: 'John',
      bestFriend: { id: 'u2', name: 'Jane', bestFriend: { id: 'u1', name: 'John' } },
    };
    const result = normalizeEntity('users', entity);

    // u1 extracts u2, u2's bestFriend is u1 (cycle) → bare ID, not re-extracted
    expect(result.normalized).toEqual({
      id: 'u1',
      name: 'John',
      bestFriend: 'u2',
    });
    expect(result.extracted.get('users')).toEqual([{ id: 'u2', name: 'Jane', bestFriend: 'u1' }]);
  });

  it('preserves non-relation fields unchanged', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const entity = {
      id: 'p1',
      title: 'Hello',
      views: 42,
      metadata: { foo: 'bar' },
      author: { id: 'u1', name: 'John' },
    };
    const result = normalizeEntity('posts', entity);

    expect(result.normalized.title).toBe('Hello');
    expect(result.normalized.views).toBe(42);
    expect(result.normalized.metadata).toEqual({ foo: 'bar' });
  });

  it('warns in dev mode when one-relation field is an unexpected type', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const entity = { id: 'p1', title: 'Hello', author: 42 };
    normalizeEntity('posts', entity);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('posts.author');
    spy.mockRestore();
  });

  it('warns in dev mode when many-relation field is not an array', () => {
    registerRelationSchema('posts', {
      tags: { type: 'many', entity: 'tags' },
    });

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const entity = { id: 'p1', title: 'Hello', tags: 'not-an-array' };
    normalizeEntity('posts', entity);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('posts.tags');
    spy.mockRestore();
  });

  it('groups multiple extracted entities by type', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
      tags: { type: 'many', entity: 'tags' },
    });

    const entity = {
      id: 'p1',
      title: 'Hello',
      author: { id: 'u1', name: 'John' },
      tags: [
        { id: 't1', name: 'TS' },
        { id: 't2', name: 'Bun' },
      ],
    };
    const result = normalizeEntity('posts', entity);

    expect(result.extracted.get('users')?.length).toBe(1);
    expect(result.extracted.get('tags')?.length).toBe(2);
  });
});
