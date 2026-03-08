import { afterEach, describe, expect, it } from 'bun:test';
import type { CodegenEntityModule } from '@vertz/codegen';
import { generateRelationManifest } from '@vertz/codegen';
import {
  getRelationSchema,
  registerRelationSchema,
  resetRelationSchemas_TEST_ONLY,
} from '@vertz/ui';

/**
 * Cross-package integration test: codegen → UI runtime.
 *
 * Verifies the end-to-end pipeline: CodegenEntityModule[] → generateRelationManifest()
 * → registerRelationSchema() → getRelationSchema() returns correct schemas.
 *
 * This simulates what the generated client.ts does at runtime: it emits
 * registerRelationSchema() calls with manifests derived from the codegen IR.
 */
describe('codegen relation manifest → UI runtime eval', () => {
  afterEach(() => {
    resetRelationSchemas_TEST_ONLY();
  });

  function executeManifest(entities: CodegenEntityModule[]): void {
    const manifest = generateRelationManifest(entities);
    for (const entry of manifest) {
      registerRelationSchema(entry.entityType, entry.schema);
    }
  }

  it('registers schemas from codegen manifest and retrieves them at runtime', () => {
    const entities: CodegenEntityModule[] = [
      {
        entityName: 'posts',
        operations: [],
        actions: [],
        relations: [
          { name: 'author', type: 'one', entity: 'users' },
          { name: 'tags', type: 'many', entity: 'tags' },
        ],
      },
      {
        entityName: 'users',
        operations: [],
        actions: [],
        relations: [],
      },
    ];

    executeManifest(entities);

    const postsSchema = getRelationSchema('posts');
    expect(postsSchema).toBeDefined();
    expect(postsSchema?.author).toEqual({ type: 'one', entity: 'users' });
    expect(postsSchema?.tags).toEqual({ type: 'many', entity: 'tags' });

    const usersSchema = getRelationSchema('users');
    expect(usersSchema).toBeDefined();
    expect(Object.keys(usersSchema!)).toHaveLength(0);
  });

  it('returns undefined for unregistered entity types', () => {
    executeManifest([
      {
        entityName: 'posts',
        operations: [],
        actions: [],
        relations: [{ name: 'author', type: 'one', entity: 'users' }],
      },
    ]);

    expect(getRelationSchema('posts')).toBeDefined();
    expect(getRelationSchema('comments')).toBeUndefined();
  });

  it('registered schemas are frozen (immutable)', () => {
    executeManifest([
      {
        entityName: 'posts',
        operations: [],
        actions: [],
        relations: [{ name: 'author', type: 'one', entity: 'users' }],
      },
    ]);

    const schema = getRelationSchema('posts');
    expect(Object.isFrozen(schema)).toBe(true);
  });

  it('entities without relations property produce empty schemas', () => {
    executeManifest([
      {
        entityName: 'tags',
        operations: [],
        actions: [],
      },
    ]);

    const schema = getRelationSchema('tags');
    expect(schema).toBeDefined();
    expect(Object.keys(schema!)).toHaveLength(0);
  });

  it('complex multi-entity manifest registers all relation schemas', () => {
    executeManifest([
      {
        entityName: 'posts',
        operations: [],
        actions: [],
        relations: [
          { name: 'author', type: 'one', entity: 'users' },
          { name: 'category', type: 'one', entity: 'categories' },
          { name: 'tags', type: 'many', entity: 'tags' },
        ],
      },
      {
        entityName: 'users',
        operations: [],
        actions: [],
        relations: [{ name: 'organization', type: 'one', entity: 'orgs' }],
      },
    ]);

    const postsSchema = getRelationSchema('posts');
    expect(postsSchema?.author).toEqual({ type: 'one', entity: 'users' });
    expect(postsSchema?.category).toEqual({ type: 'one', entity: 'categories' });
    expect(postsSchema?.tags).toEqual({ type: 'many', entity: 'tags' });

    const usersSchema = getRelationSchema('users');
    expect(usersSchema?.organization).toEqual({ type: 'one', entity: 'orgs' });
  });
});
