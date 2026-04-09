import { describe, expect, it } from '@vertz/test';
import type { CodegenEntityModule } from '../../types';
import { generateRelationManifest } from '../relation-manifest-generator';

describe('generateRelationManifest', () => {
  it('generates manifest entry with one-relation', () => {
    const entities: CodegenEntityModule[] = [
      {
        entityName: 'posts',
        operations: [],
        actions: [],
        relations: [{ name: 'author', type: 'one', entity: 'users' }],
      },
    ];

    const manifest = generateRelationManifest(entities);

    expect(manifest).toEqual([
      {
        entityType: 'posts',
        schema: { author: { type: 'one', entity: 'users' } },
      },
    ]);
  });

  it('generates manifest entry with many-relation', () => {
    const entities: CodegenEntityModule[] = [
      {
        entityName: 'posts',
        operations: [],
        actions: [],
        relations: [{ name: 'tags', type: 'many', entity: 'tags' }],
      },
    ];

    const manifest = generateRelationManifest(entities);

    expect(manifest).toEqual([
      {
        entityType: 'posts',
        schema: { tags: { type: 'many', entity: 'tags' } },
      },
    ]);
  });

  it('generates empty schema for entity with no relations', () => {
    const entities: CodegenEntityModule[] = [
      {
        entityName: 'users',
        operations: [],
        actions: [],
        relations: [],
      },
    ];

    const manifest = generateRelationManifest(entities);

    expect(manifest).toEqual([{ entityType: 'users', schema: {} }]);
  });

  it('generates empty schema for entity without relations property', () => {
    const entities: CodegenEntityModule[] = [
      {
        entityName: 'users',
        operations: [],
        actions: [],
      },
    ];

    const manifest = generateRelationManifest(entities);

    expect(manifest).toEqual([{ entityType: 'users', schema: {} }]);
  });

  it('generates manifest entries for multiple entities', () => {
    const entities: CodegenEntityModule[] = [
      {
        entityName: 'posts',
        operations: [],
        actions: [],
        relations: [{ name: 'author', type: 'one', entity: 'users' }],
      },
      {
        entityName: 'users',
        operations: [],
        actions: [],
        relations: [],
      },
    ];

    const manifest = generateRelationManifest(entities);

    expect(manifest).toHaveLength(2);
    expect(manifest[0].entityType).toBe('posts');
    expect(manifest[1].entityType).toBe('users');
  });

  it('handles entity with multiple relations', () => {
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
    ];

    const manifest = generateRelationManifest(entities);

    expect(manifest).toEqual([
      {
        entityType: 'posts',
        schema: {
          author: { type: 'one', entity: 'users' },
          tags: { type: 'many', entity: 'tags' },
        },
      },
    ]);
  });
});
