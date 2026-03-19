/**
 * Tenant Chain Edge Cases — Coverage hardening for entity/tenant-chain.ts
 * Tests: direct-to-root scope, broken chain, PK default fallback
 */

import { describe, expect, it } from 'bun:test';
import { computeTenantGraph, d } from '@vertz/db';
import { resolveTenantChain } from '../tenant-chain';

describe('Tenant Chain Edge Cases', () => {
  describe('Given an indirectly scoped entity that references the root directly', () => {
    describe('When resolveTenantChain is called', () => {
      it('Then returns chain reaching tenant root with foreignKey as tenantColumn (line 135)', () => {
        // Need a directly scoped entity to establish the root
        const organizations = d.table('organizations', {
          id: d.uuid().primary(),
          name: d.text(),
        });
        const projects = d.table('projects', {
          id: d.uuid().primary(),
          organizationId: d.uuid(),
          name: d.text(),
        });
        // notes references organizations (the root) directly
        const notes = d.table('notes', {
          id: d.uuid().primary(),
          organizationId: d.uuid(),
          body: d.text(),
        });

        const registry = {
          organizations: d.model(organizations),
          projects: d.model(
            projects,
            { organization: d.ref.one(() => organizations, 'organizationId') },
            { tenant: 'organization' },
          ),
          notes: d.model(notes, {
            organization: d.ref.one(() => organizations, 'organizationId'),
          }),
        };

        const graph = computeTenantGraph(registry);
        const chain = resolveTenantChain('notes', graph, registry);

        expect(chain).not.toBeNull();
        expect(chain!.hops).toHaveLength(1);
        expect(chain!.hops[0]!.tableName).toBe('organizations');
        // When reaching root, tenantColumn is the foreignKey of the last hop
        expect(chain!.tenantColumn).toBe('organizationId');
      });
    });
  });

  describe('Given an indirectly scoped entity with no valid relation path', () => {
    describe('When resolveTenantChain is called', () => {
      it('Then returns null (line 145)', () => {
        const organizations = d.table('organizations', {
          id: d.uuid().primary(),
          name: d.text(),
        });

        const projects = d.table('projects', {
          id: d.uuid().primary(),
          orgId: d.uuid(),
          name: d.text(),
        });

        // orphan has a relation but only to an unscoped target
        const unscoped = d.table('unscoped_items', {
          id: d.uuid().primary(),
          name: d.text(),
        });

        const orphan = d.table('orphan_items', {
          id: d.uuid().primary(),
          unscopedId: d.uuid(),
          title: d.text(),
        });

        const registry = {
          organizations: d.model(organizations),
          projects: d.model(
            projects,
            { org: d.ref.one(() => organizations, 'orgId') },
            { tenant: 'org' },
          ),
          unscopedItems: d.model(unscoped),
          orphanItems: d.model(orphan, {
            unscopedItem: d.ref.one(() => unscoped, 'unscopedId'),
          }),
        };

        // Force orphanItems into the indirectlyScoped list by modifying the graph
        const graph = computeTenantGraph(registry);
        const modifiedGraph = {
          ...graph,
          indirectlyScoped: [...graph.indirectlyScoped, 'orphanItems'],
        };

        const chain = resolveTenantChain('orphanItems', modifiedGraph, registry);
        expect(chain).toBeNull();
      });
    });
  });

  describe('Given a table with no .primary() column metadata', () => {
    describe('When resolveTenantChain resolves the PK', () => {
      it('Then defaults to "id" (lines 158-160)', () => {
        // Use the same schema as the main test but without .primary() on projects
        const organizations = d.table('organizations', {
          id: d.uuid().primary(),
          name: d.text(),
        });

        // projects table: id exists but has NO .primary() call — tests PK fallback
        const projects = d.table('pk_fallback_projects', {
          id: d.uuid(),
          orgId: d.uuid(),
          name: d.text(),
        });

        const tasks = d.table('pk_fallback_tasks', {
          id: d.uuid().primary(),
          projectId: d.uuid(),
          title: d.text(),
        });

        const registry = {
          organizations: d.model(organizations),
          projects: d.model(
            projects,
            { org: d.ref.one(() => organizations, 'orgId') },
            { tenant: 'org' },
          ),
          tasks: d.model(tasks, {
            project: d.ref.one(() => projects, 'projectId'),
          }),
        };

        const graph = computeTenantGraph(registry);
        const chain = resolveTenantChain('tasks', graph, registry);

        expect(chain).not.toBeNull();
        // The hop targeting projects should use 'id' as targetColumn (fallback)
        expect(chain!.hops[0]!.targetColumn).toBe('id');
      });
    });
  });

  describe('Given a cycle in the relation chain', () => {
    describe('When resolveTenantChain walks the chain', () => {
      it('Then detects the cycle and returns null (line 93)', () => {
        const organizations = d.table('organizations', {
          id: d.uuid().primary(),
          name: d.text(),
        });

        const projects = d.table('cycle_projects', {
          id: d.uuid().primary(),
          orgId: d.uuid(),
          name: d.text(),
        });

        // Create a cycle: A → B → A (neither reaches root or directly scoped)
        const tableA = d.table('cycle_a', {
          id: d.uuid().primary(),
          bId: d.uuid(),
        });

        const tableB = d.table('cycle_b', {
          id: d.uuid().primary(),
          aId: d.uuid(),
        });

        const registry = {
          organizations: d.model(organizations),
          projects: d.model(
            projects,
            { org: d.ref.one(() => organizations, 'orgId') },
            { tenant: 'org' },
          ),
          tableA: d.model(tableA, {
            b: d.ref.one(() => tableB, 'bId'),
          }),
          tableB: d.model(tableB, {
            a: d.ref.one(() => tableA, 'aId'),
          }),
        };

        const graph = computeTenantGraph(registry);
        // Both tables reference each other and are both marked as indirectly scoped
        // Walk: tableA → tableB → tableA (cycle detected)
        const cyclicGraph = {
          ...graph,
          indirectlyScoped: ['tableA', 'tableB'],
        };

        const chain = resolveTenantChain('tableA', cyclicGraph, registry);
        // Cycle detected: tableA visited twice → returns null
        expect(chain).toBeNull();
      });
    });
  });
});
