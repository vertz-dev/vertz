import { describe, expect, it } from 'bun:test';
import { InMemoryClosureStore } from '../closure-store';

describe('InMemoryClosureStore', () => {
  it('adds a resource with self-reference row (depth 0)', async () => {
    const store = new InMemoryClosureStore();
    await store.addResource('Org', 'org-1');
    const ancestors = await store.getAncestors('Org', 'org-1');
    expect(ancestors).toEqual([{ type: 'Org', id: 'org-1', depth: 0 }]);
  });

  it('adds a child resource with ancestor paths', async () => {
    const store = new InMemoryClosureStore();
    await store.addResource('Org', 'org-1');
    await store.addResource('Team', 'team-1', { parentType: 'Org', parentId: 'org-1' });

    const ancestors = await store.getAncestors('Team', 'team-1');
    expect(ancestors).toHaveLength(2);
    expect(ancestors).toContainEqual({ type: 'Team', id: 'team-1', depth: 0 });
    expect(ancestors).toContainEqual({ type: 'Org', id: 'org-1', depth: 1 });
  });

  it('builds full ancestor chain through multiple levels', async () => {
    const store = new InMemoryClosureStore();
    await store.addResource('Org', 'org-1');
    await store.addResource('Team', 'team-1', { parentType: 'Org', parentId: 'org-1' });
    await store.addResource('Project', 'proj-1', { parentType: 'Team', parentId: 'team-1' });

    const ancestors = await store.getAncestors('Project', 'proj-1');
    expect(ancestors).toHaveLength(3);
    expect(ancestors).toContainEqual({ type: 'Project', id: 'proj-1', depth: 0 });
    expect(ancestors).toContainEqual({ type: 'Team', id: 'team-1', depth: 1 });
    expect(ancestors).toContainEqual({ type: 'Org', id: 'org-1', depth: 2 });
  });

  it('gets descendants of a resource', async () => {
    const store = new InMemoryClosureStore();
    await store.addResource('Org', 'org-1');
    await store.addResource('Team', 'team-1', { parentType: 'Org', parentId: 'org-1' });
    await store.addResource('Team', 'team-2', { parentType: 'Org', parentId: 'org-1' });

    const descendants = await store.getDescendants('Org', 'org-1');
    expect(descendants).toHaveLength(3); // self + 2 teams
    expect(descendants).toContainEqual({ type: 'Org', id: 'org-1', depth: 0 });
    expect(descendants).toContainEqual({ type: 'Team', id: 'team-1', depth: 1 });
    expect(descendants).toContainEqual({ type: 'Team', id: 'team-2', depth: 1 });
  });

  it('removes a resource and cascades closure rows', async () => {
    const store = new InMemoryClosureStore();
    await store.addResource('Org', 'org-1');
    await store.addResource('Team', 'team-1', { parentType: 'Org', parentId: 'org-1' });
    await store.addResource('Project', 'proj-1', { parentType: 'Team', parentId: 'team-1' });

    await store.removeResource('Team', 'team-1');

    // team-1 and its descendant proj-1 should be gone from org-1's descendants
    const descendants = await store.getDescendants('Org', 'org-1');
    expect(descendants).toHaveLength(1); // only self
    expect(descendants).toContainEqual({ type: 'Org', id: 'org-1', depth: 0 });

    // team-1 should have no ancestors
    const teamAncestors = await store.getAncestors('Team', 'team-1');
    expect(teamAncestors).toHaveLength(0);
  });

  it('enforces 4-level depth cap', async () => {
    const store = new InMemoryClosureStore();
    await store.addResource('A', 'a-1');
    await store.addResource('B', 'b-1', { parentType: 'A', parentId: 'a-1' });
    await store.addResource('C', 'c-1', { parentType: 'B', parentId: 'b-1' });
    await store.addResource('D', 'd-1', { parentType: 'C', parentId: 'c-1' });

    expect(store.addResource('E', 'e-1', { parentType: 'D', parentId: 'd-1' })).rejects.toThrow(
      'Hierarchy depth exceeds maximum of 4 levels',
    );
  });

  it('hasPath returns true for ancestor-descendant relationship', async () => {
    const store = new InMemoryClosureStore();
    await store.addResource('Org', 'org-1');
    await store.addResource('Team', 'team-1', { parentType: 'Org', parentId: 'org-1' });

    expect(await store.hasPath('Org', 'org-1', 'Team', 'team-1')).toBe(true);
    expect(await store.hasPath('Team', 'team-1', 'Org', 'org-1')).toBe(false);
  });

  it('hasPath returns true for self-reference', async () => {
    const store = new InMemoryClosureStore();
    await store.addResource('Org', 'org-1');

    expect(await store.hasPath('Org', 'org-1', 'Org', 'org-1')).toBe(true);
  });

  it('dispose clears all data', async () => {
    const store = new InMemoryClosureStore();
    await store.addResource('Org', 'org-1');
    store.dispose();

    const ancestors = await store.getAncestors('Org', 'org-1');
    expect(ancestors).toHaveLength(0);
  });
});
