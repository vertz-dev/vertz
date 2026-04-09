import { afterEach, describe, expect, it } from '@vertz/test';
import { computed } from '../../runtime/signal';
import { EntityStore } from '../entity-store';
import { registerRelationSchema, resetRelationSchemas_TEST_ONLY } from '../relation-registry';
import { resolveReferences } from '../resolve';

/**
 * Integration tests for the full deep normalization pipeline:
 * merge (write-side normalize) → EntityStore → resolveReferences (read-side) → ref counting.
 *
 * Each test exercises the end-to-end flow, not individual functions.
 */
describe('deep normalization integration', () => {
  afterEach(() => {
    resetRelationSchemas_TEST_ONLY();
  });

  // ── Write-side: merge normalizes nested entities ─────────────────

  it('extracts one-relation nested object on merge', () => {
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
    const post = store.get('posts', 'p1').value as Record<string, unknown>;
    expect(post.author).toBe('u1');

    // User extracted into its own entity type
    const user = store.get('users', 'u1').value as Record<string, unknown>;
    expect(user.name).toBe('John');
  });

  it('extracts many-relation nested array on merge', () => {
    registerRelationSchema('posts', {
      tags: { type: 'many', entity: 'tags' },
    });

    const store = new EntityStore();
    store.merge('posts', {
      id: 'p1',
      title: 'Hello',
      tags: [
        { id: 't1', name: 'TypeScript' },
        { id: 't2', name: 'Bun' },
      ],
    });

    // Post stored with array of bare IDs
    const post = store.get('posts', 'p1').value as Record<string, unknown>;
    expect(post.tags).toEqual(['t1', 't2']);

    // Tags extracted
    expect(store.size('tags')).toBe(2);
    expect((store.get('tags', 't1').value as Record<string, unknown>).name).toBe('TypeScript');
  });

  it('deep nesting: post → author → organization', () => {
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

    // All three entity types populated
    expect(store.has('posts', 'p1')).toBe(true);
    expect(store.has('users', 'u1')).toBe(true);
    expect(store.has('orgs', 'o1')).toBe(true);

    // User stored with bare org ID
    const user = store.get('users', 'u1').value as Record<string, unknown>;
    expect(user.organization).toBe('o1');
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

  // ── Read-side: resolveReferences reconstructs nested objects ─────

  it('resolves bare ID refs back to full entity objects', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const store = new EntityStore();
    store.merge('posts', {
      id: 'p1',
      title: 'Hello',
      author: { id: 'u1', name: 'John' },
    });

    const raw = store.get('posts', 'p1').value as Record<string, unknown>;
    const resolved = resolveReferences(raw, 'posts', store);

    expect(resolved.author).toEqual({ id: 'u1', name: 'John' });
  });

  it('resolves missing entity reference as null', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const store = new EntityStore();
    // Merge post with bare ID — but no corresponding user in store
    store.merge('posts', { id: 'p1', title: 'Hello', author: 'u-missing' });

    const raw = store.get('posts', 'p1').value as Record<string, unknown>;
    const resolved = resolveReferences(raw, 'posts', store);

    expect(resolved.author).toBeNull();
  });

  it('collects transitive refKeys through the full pipeline', () => {
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

    const raw = store.get('posts', 'p1').value as Record<string, unknown>;
    const refKeys = new Set<string>();
    resolveReferences(raw, 'posts', store, undefined, refKeys);

    expect(refKeys.has('posts:p1')).toBe(true);
    expect(refKeys.has('users:u1')).toBe(true);
    expect(refKeys.has('orgs:o1')).toBe(true);
  });

  // ── Cross-entity reactive propagation ────────────────────────────

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
      { id: 'p1', title: 'Post 1', author: { id: 'u1', name: 'John' } },
      { id: 'p2', title: 'Post 2', author: { id: 'u1', name: 'John' } },
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
    const comment1 = computed(() => {
      const raw = store.get('comments', 'c1').value as Record<string, unknown>;
      if (!raw) return undefined;
      return resolveReferences(raw, 'comments', store);
    });

    expect((post1.value as Record<string, unknown>).author).toEqual({
      id: 'u1',
      name: 'John',
    });
    expect((comment1.value as Record<string, unknown>).author).toEqual({
      id: 'u1',
      name: 'John',
    });

    // Update the shared author
    store.merge('users', { id: 'u1', name: 'Jane' });

    // Both computeds reflect the change
    expect(((post1.value as Record<string, unknown>).author as Record<string, unknown>).name).toBe(
      'Jane',
    );
    expect(
      ((comment1.value as Record<string, unknown>).author as Record<string, unknown>).name,
    ).toBe('Jane');
  });

  // ── Memory efficiency ────────────────────────────────────────────

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

  // ── Ref counting + eviction ──────────────────────────────────────

  it('ref counting: addRef/removeRef lifecycle through resolve pipeline', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const store = new EntityStore();
    store.merge('posts', {
      id: 'p1',
      title: 'Hello',
      author: { id: 'u1', name: 'John' },
    });

    // Resolve with refKeys
    const raw = store.get('posts', 'p1').value as Record<string, unknown>;
    const refKeys = new Set<string>();
    resolveReferences(raw, 'posts', store, undefined, refKeys);

    // Add refs for each entity in the refKeys set
    for (const key of refKeys) {
      const [type, id] = key.split(':');
      store.addRef(type, id);
    }
    expect(store.inspect('posts', 'p1')?.refCount).toBe(1);
    expect(store.inspect('users', 'u1')?.refCount).toBe(1);

    // Remove refs
    for (const key of refKeys) {
      const [type, id] = key.split(':');
      store.removeRef(type, id);
    }
    expect(store.inspect('posts', 'p1')?.refCount).toBe(0);
    expect(store.inspect('users', 'u1')?.refCount).toBe(0);
    expect(store.inspect('posts', 'p1')?.orphanedAt).not.toBeNull();
    expect(store.inspect('users', 'u1')?.orphanedAt).not.toBeNull();
  });

  // ── Backward compatibility ───────────────────────────────────────

  it('backward compat: no schema registered — merge stores as-is, resolve passes through', () => {
    const store = new EntityStore();
    store.merge('posts', {
      id: 'p1',
      title: 'Hello',
      author: { id: 'u1', name: 'John' },
    });

    // Without schema, nested object is stored as-is (not normalized)
    const raw = store.get('posts', 'p1').value as Record<string, unknown>;
    expect(raw.author).toEqual({ id: 'u1', name: 'John' });

    // No users entity type created
    expect(store.has('users', 'u1')).toBe(false);

    // Resolve passes through unchanged
    const resolved = resolveReferences(raw, 'posts', store);
    expect(resolved.author).toEqual({ id: 'u1', name: 'John' });
  });

  it('backward compat: resolveReferences passes through non-string relation values', () => {
    registerRelationSchema('posts', {
      author: { type: 'one', entity: 'users' },
    });

    const store = new EntityStore();

    // Simulate already-denormalized data (object, not bare ID)
    store.merge('posts', { id: 'p1', title: 'Hello', author: { id: 'u1', name: 'John' } });

    // The store normalizes on merge, so author is now 'u1'
    // But if we manually construct a record with an object value:
    const manualRecord = { id: 'p1', title: 'Hello', author: { id: 'u1', name: 'John' } };
    const resolved = resolveReferences(manualRecord, 'posts', store);

    // Object values pass through unchanged
    expect(resolved.author).toEqual({ id: 'u1', name: 'John' });
  });

  it('backward compat: non-normalized objects work without schema', () => {
    const store = new EntityStore();

    // Merge complex nested objects — no schema, no normalization
    store.merge('tasks', {
      id: 't1',
      title: 'Build feature',
      assignee: { id: 'u1', name: 'Alice', role: 'engineer' },
      metadata: { priority: 'high', labels: ['urgent', 'frontend'] },
    });

    const task = store.get('tasks', 't1').value as Record<string, unknown>;
    // Everything stored as-is
    expect(task.assignee).toEqual({ id: 'u1', name: 'Alice', role: 'engineer' });
    expect(task.metadata).toEqual({ priority: 'high', labels: ['urgent', 'frontend'] });

    // Resolve returns same data
    const resolved = resolveReferences(task, 'tasks', store);
    expect(resolved.assignee).toEqual({ id: 'u1', name: 'Alice', role: 'engineer' });
  });
});
