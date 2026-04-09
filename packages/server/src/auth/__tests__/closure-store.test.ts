import { describe, expect, it } from '@vertz/test';
import { InMemoryClosureStore } from '../closure-store';

describe('InMemoryClosureStore', () => {
  it('adds a resource with self-reference row (depth 0)', async () => {
    const store = new InMemoryClosureStore();
    await store.addResource('organization', 'org-1');
    const ancestors = await store.getAncestors('organization', 'org-1');
    expect(ancestors).toEqual([{ type: 'organization', id: 'org-1', depth: 0 }]);
  });

  it('adds a child resource with ancestor paths', async () => {
    const store = new InMemoryClosureStore();
    await store.addResource('organization', 'org-1');
    await store.addResource('team', 'team-1', {
      parentType: 'organization',
      parentId: 'org-1',
    });

    const ancestors = await store.getAncestors('team', 'team-1');
    expect(ancestors).toHaveLength(2);
    expect(ancestors).toContainEqual({ type: 'team', id: 'team-1', depth: 0 });
    expect(ancestors).toContainEqual({ type: 'organization', id: 'org-1', depth: 1 });
  });

  it('builds full ancestor chain through multiple levels', async () => {
    const store = new InMemoryClosureStore();
    await store.addResource('organization', 'org-1');
    await store.addResource('team', 'team-1', {
      parentType: 'organization',
      parentId: 'org-1',
    });
    await store.addResource('project', 'proj-1', {
      parentType: 'team',
      parentId: 'team-1',
    });

    const ancestors = await store.getAncestors('project', 'proj-1');
    expect(ancestors).toHaveLength(3);
    expect(ancestors).toContainEqual({ type: 'project', id: 'proj-1', depth: 0 });
    expect(ancestors).toContainEqual({ type: 'team', id: 'team-1', depth: 1 });
    expect(ancestors).toContainEqual({ type: 'organization', id: 'org-1', depth: 2 });
  });

  it('gets descendants of a resource', async () => {
    const store = new InMemoryClosureStore();
    await store.addResource('organization', 'org-1');
    await store.addResource('team', 'team-1', {
      parentType: 'organization',
      parentId: 'org-1',
    });
    await store.addResource('team', 'team-2', {
      parentType: 'organization',
      parentId: 'org-1',
    });

    const descendants = await store.getDescendants('organization', 'org-1');
    expect(descendants).toHaveLength(3); // self + 2 teams
    expect(descendants).toContainEqual({ type: 'organization', id: 'org-1', depth: 0 });
    expect(descendants).toContainEqual({ type: 'team', id: 'team-1', depth: 1 });
    expect(descendants).toContainEqual({ type: 'team', id: 'team-2', depth: 1 });
  });

  it('removes a resource and cascades closure rows', async () => {
    const store = new InMemoryClosureStore();
    await store.addResource('organization', 'org-1');
    await store.addResource('team', 'team-1', {
      parentType: 'organization',
      parentId: 'org-1',
    });
    await store.addResource('project', 'proj-1', {
      parentType: 'team',
      parentId: 'team-1',
    });

    await store.removeResource('team', 'team-1');

    const descendants = await store.getDescendants('organization', 'org-1');
    expect(descendants).toHaveLength(1); // only self
    expect(descendants).toContainEqual({ type: 'organization', id: 'org-1', depth: 0 });

    const teamAncestors = await store.getAncestors('team', 'team-1');
    expect(teamAncestors).toHaveLength(0);
  });

  it('enforces 4-level depth cap', async () => {
    const store = new InMemoryClosureStore();
    await store.addResource('a', 'a-1');
    await store.addResource('b', 'b-1', { parentType: 'a', parentId: 'a-1' });
    await store.addResource('c', 'c-1', { parentType: 'b', parentId: 'b-1' });
    await store.addResource('d', 'd-1', { parentType: 'c', parentId: 'c-1' });

    expect(store.addResource('e', 'e-1', { parentType: 'd', parentId: 'd-1' })).rejects.toThrow(
      'Hierarchy depth exceeds maximum of 4 levels',
    );
  });

  it('hasPath returns true for ancestor-descendant relationship', async () => {
    const store = new InMemoryClosureStore();
    await store.addResource('organization', 'org-1');
    await store.addResource('team', 'team-1', {
      parentType: 'organization',
      parentId: 'org-1',
    });

    expect(await store.hasPath('organization', 'org-1', 'team', 'team-1')).toBe(true);
    expect(await store.hasPath('team', 'team-1', 'organization', 'org-1')).toBe(false);
  });

  it('hasPath returns true for self-reference', async () => {
    const store = new InMemoryClosureStore();
    await store.addResource('organization', 'org-1');

    expect(await store.hasPath('organization', 'org-1', 'organization', 'org-1')).toBe(true);
  });

  it('dispose clears all data', async () => {
    const store = new InMemoryClosureStore();
    await store.addResource('organization', 'org-1');
    store.dispose();

    const ancestors = await store.getAncestors('organization', 'org-1');
    expect(ancestors).toHaveLength(0);
  });
});
