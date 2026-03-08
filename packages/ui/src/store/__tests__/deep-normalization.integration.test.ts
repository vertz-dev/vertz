import { afterEach, describe, expect, it } from 'bun:test';
import { computed } from '../../runtime/signal';
import { EntityStore } from '../entity-store';
import { registerRelationSchema, resetRelationSchemas_TEST_ONLY } from '../relation-registry';
import { resolveReferences } from '../resolve';

describe('deep normalization integration', () => {
  afterEach(() => {
    resetRelationSchemas_TEST_ONLY();
  });

  it('cross-entity reactive propagation: updating shared author updates all computeds', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });
    registerRelationSchema('comments', {
      author: { type: 'one', entity: 'users' },
    });

    const store = new EntityStore();

    // Merge with nested author — deep normalization extracts user
    store.merge('posts', [
      {
        id: 'p1',
        title: 'Post 1',
        author: { id: 'u1', name: 'John' },
      },
      {
        id: 'p2',
        title: 'Post 2',
        author: { id: 'u1', name: 'John' },
      },
    ]);
    store.merge('comments', {
      id: 'c1',
      text: 'Great post',
      author: { id: 'u1', name: 'John' },
    });

    // Create computed signals that resolve references
    const post1 = computed(() => {
      const raw = store.get('posts', 'p1').value as Record<string, unknown>;
      if (!raw) return undefined;
      return resolveReferences(raw, 'posts', store);
    });
    const post2 = computed(() => {
      const raw = store.get('posts', 'p2').value as Record<string, unknown>;
      if (!raw) return undefined;
      return resolveReferences(raw, 'posts', store);
    });
    const comment1 = computed(() => {
      const raw = store.get('comments', 'c1').value as Record<string, unknown>;
      if (!raw) return undefined;
      return resolveReferences(raw, 'comments', store);
    });

    // All three reference the same author
    const author1 = (post1.value as Record<string, unknown>).author as Record<string, unknown>;
    const author2 = (post2.value as Record<string, unknown>).author as Record<string, unknown>;
    const author3 = (comment1.value as Record<string, unknown>).author as Record<string, unknown>;
    expect(author1.name).toBe('John');
    expect(author2.name).toBe('John');
    expect(author3.name).toBe('John');

    // Update the shared author
    store.merge('users', { id: 'u1', name: 'Jane' });

    // All three computeds reflect the change
    const updatedAuthor1 = (post1.value as Record<string, unknown>).author as Record<
      string,
      unknown
    >;
    const updatedAuthor2 = (post2.value as Record<string, unknown>).author as Record<
      string,
      unknown
    >;
    const updatedAuthor3 = (comment1.value as Record<string, unknown>).author as Record<
      string,
      unknown
    >;
    expect(updatedAuthor1.name).toBe('Jane');
    expect(updatedAuthor2.name).toBe('Jane');
    expect(updatedAuthor3.name).toBe('Jane');
  });

  it('memory efficiency: 100 posts by same author = 1 user entry', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const store = new EntityStore();
    const posts = Array.from({ length: 100 }, (_, i) => ({
      id: `p${i}`,
      title: `Post ${i}`,
      author: { id: 'u1', name: 'John' },
    }));

    store.merge('posts', posts);

    expect(store.size('users')).toBe(1);
    expect(store.size('posts')).toBe(100);
  });

  it('merge with deep normalization enriches existing entity fields', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const store = new EntityStore();

    // First query returns author with name only
    store.merge('posts', {
      id: 'p1',
      title: 'Post 1',
      author: { id: 'u1', name: 'John' },
    });

    // Second query returns author with additional fields
    store.merge('posts', {
      id: 'p2',
      title: 'Post 2',
      author: { id: 'u1', name: 'John', email: 'john@example.com' },
    });

    // User entity has all fields from both merges
    const user = store.get('users', 'u1').value as Record<string, unknown>;
    expect(user.name).toBe('John');
    expect(user.email).toBe('john@example.com');
  });
});
