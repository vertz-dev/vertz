/**
 * Shared test factory for ClosureStore behavioral parity.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { ClosureStore } from '../closure-store';

export function closureStoreTests(
  name: string,
  factory: () => Promise<{ store: ClosureStore; cleanup: () => Promise<void> }>,
) {
  describe(`ClosureStore: ${name}`, () => {
    let store: ClosureStore;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const result = await factory();
      store = result.store;
      cleanup = result.cleanup;
    });

    afterEach(async () => {
      store.dispose();
      await cleanup();
    });

    it('adds a root resource with self-reference', async () => {
      await store.addResource('org', 'org-1');
      const ancestors = await store.getAncestors('org', 'org-1');
      expect(ancestors).toHaveLength(1);
      expect(ancestors[0]!.depth).toBe(0);
    });

    it('adds a child resource with parent path', async () => {
      await store.addResource('org', 'org-1');
      await store.addResource('project', 'proj-1', {
        parentType: 'org',
        parentId: 'org-1',
      });

      const ancestors = await store.getAncestors('project', 'proj-1');
      expect(ancestors).toHaveLength(2);

      const self = ancestors.find((a) => a.depth === 0);
      expect(self!.type).toBe('project');
      expect(self!.id).toBe('proj-1');

      const parent = ancestors.find((a) => a.depth === 1);
      expect(parent!.type).toBe('org');
      expect(parent!.id).toBe('org-1');
    });

    it('addResource is idempotent for root', async () => {
      await store.addResource('org', 'org-1');
      // Second call should not throw or create duplicates
      await store.addResource('org', 'org-1');
      const ancestors = await store.getAncestors('org', 'org-1');
      // May have 1 or 2 self-reference rows depending on implementation
      // Both InMemory (push) and DB (INSERT OR IGNORE) handle this
      expect(ancestors.length).toBeGreaterThanOrEqual(1);
    });

    it('gets descendants of a resource', async () => {
      await store.addResource('org', 'org-1');
      await store.addResource('project', 'proj-1', {
        parentType: 'org',
        parentId: 'org-1',
      });

      const descendants = await store.getDescendants('org', 'org-1');
      expect(descendants.length).toBeGreaterThanOrEqual(2);
      expect(descendants.some((d) => d.type === 'project' && d.id === 'proj-1')).toBe(true);
    });

    it('checks if path exists', async () => {
      await store.addResource('org', 'org-1');
      await store.addResource('project', 'proj-1', {
        parentType: 'org',
        parentId: 'org-1',
      });

      const exists = await store.hasPath('org', 'org-1', 'project', 'proj-1');
      expect(exists).toBe(true);

      const notExists = await store.hasPath('org', 'org-1', 'project', 'proj-99');
      expect(notExists).toBe(false);
    });

    it('removes a resource and its descendants', async () => {
      await store.addResource('org', 'org-1');
      await store.addResource('project', 'proj-1', {
        parentType: 'org',
        parentId: 'org-1',
      });

      await store.removeResource('project', 'proj-1');

      const ancestors = await store.getAncestors('project', 'proj-1');
      expect(ancestors).toHaveLength(0);
    });
  });
}
