import { describe, expect, it } from 'bun:test';
import {
  getRelationSchema,
  registerRelationSchema,
  resetRelationSchemas_TEST_ONLY,
} from '../relation-registry';

describe('relation-registry', () => {
  it('stores a schema retrievable by getRelationSchema', () => {
    resetRelationSchemas_TEST_ONLY();

    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const schema = getRelationSchema('posts');
    expect(schema).toEqual({
      author: { type: 'one', entity: 'users' },
    });
  });

  it('returns undefined for unregistered entity types', () => {
    resetRelationSchemas_TEST_ONLY();
    expect(getRelationSchema('unknown')).toBeUndefined();
  });

  it('freezes the registered schema', () => {
    resetRelationSchemas_TEST_ONLY();

    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const schema = getRelationSchema('posts')!;
    expect(Object.isFrozen(schema)).toBe(true);
  });

  it('overwrites previously registered schema', () => {
    resetRelationSchemas_TEST_ONLY();

    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    registerRelationSchema('posts', {
      tags: { type: 'many', entity: 'tags' },
    });

    const schema = getRelationSchema('posts');
    expect(schema).toEqual({
      tags: { type: 'many', entity: 'tags' },
    });
  });

  it('removes all schemas on reset', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });
    registerRelationSchema('users', {});

    resetRelationSchemas_TEST_ONLY();

    expect(getRelationSchema('posts')).toBeUndefined();
    expect(getRelationSchema('users')).toBeUndefined();
  });
});
