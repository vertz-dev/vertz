/**
 * Tenant Chain Edge Cases — Coverage hardening for entity/tenant-chain.ts
 * Tests: direct-to-root scope, broken chain, PK default fallback, cycles
 */

import { describe, expect, it } from '@vertz/test';
import { computeTenantGraph, d } from '@vertz/db';
import { resolveTenantChain, resolveTenantFkFromRelations } from '../tenant-chain';

describe('resolveTenantFkFromRelations', () => {
  it('returns the FK when the entry has a ref.one targeting the root table', () => {
    const organizations = d
      .table('organizations', { id: d.uuid().primary(), name: d.text() })
      .tenant();
    const projects = d.table('projects', {
      id: d.uuid().primary(),
      orgId: d.uuid(),
      name: d.text(),
    });
    const projectsModel = d.model(projects, {
      org: d.ref.one(() => organizations, 'orgId'),
    });

    const result = resolveTenantFkFromRelations(projectsModel, 'organizations');
    expect(result).toBe('orgId');
  });

  it('returns null when no ref.one targets the root table', () => {
    const other = d.table('other', { id: d.uuid().primary(), name: d.text() });
    const items = d.table('items', { id: d.uuid().primary(), otherId: d.uuid() });
    const itemsModel = d.model(items, {
      other: d.ref.one(() => other, 'otherId'),
    });

    const result = resolveTenantFkFromRelations(itemsModel, 'organizations');
    expect(result).toBeNull();
  });
});

describe('Tenant Chain Edge Cases', () => {
  describe('Given a model with ref.one directly to the root table', () => {
    describe('When resolveTenantChain is called', () => {
      it('Then returns null because it is classified as directly scoped, not indirectly', () => {
        const organizations = d
          .table('organizations', {
            id: d.uuid().primary(),
            name: d.text(),
          })
          .tenant();
        const projects = d.table('projects', {
          id: d.uuid().primary(),
          organizationId: d.uuid(),
          name: d.text(),
        });
        // notes has ref.one to root — classified as directly scoped by computeTenantGraph
        const notes = d.table('notes', {
          id: d.uuid().primary(),
          organizationId: d.uuid(),
          body: d.text(),
        });

        const registry = {
          organizations: d.model(organizations),
          projects: d.model(projects, {
            organization: d.ref.one(() => organizations, 'organizationId'),
          }),
          notes: d.model(notes, {
            organization: d.ref.one(() => organizations, 'organizationId'),
          }),
        };

        const graph = computeTenantGraph(registry);
        // notes is directly scoped (has ref.one to root), not indirectly scoped
        expect(graph.directlyScoped).toContain('notes');
        // resolveTenantChain only resolves for indirectly scoped entities
        const chain = resolveTenantChain('notes', graph, registry);
        expect(chain).toBeNull();
      });
    });
  });

  describe('Given an indirectly scoped entity with no valid relation path', () => {
    describe('When resolveTenantChain is called', () => {
      it('Then returns null', () => {
        const organizations = d
          .table('organizations', {
            id: d.uuid().primary(),
            name: d.text(),
          })
          .tenant();

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
          projects: d.model(projects, {
            org: d.ref.one(() => organizations, 'orgId'),
          }),
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
      it('Then defaults to "id"', () => {
        const organizations = d
          .table('organizations', {
            id: d.uuid().primary(),
            name: d.text(),
          })
          .tenant();

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
          projects: d.model(projects, {
            org: d.ref.one(() => organizations, 'orgId'),
          }),
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

  describe('Given an indirectly scoped entity but tenantGraph.root is null', () => {
    describe('When resolveTenantChain is called', () => {
      it('Then returns null', () => {
        const organizations = d
          .table('organizations', {
            id: d.uuid().primary(),
            name: d.text(),
          })
          .tenant();

        const projects = d.table('projects_nullroot', {
          id: d.uuid().primary(),
          orgId: d.uuid(),
          name: d.text(),
        });

        const registry = {
          organizations: d.model(organizations),
          projects: d.model(projects, {
            org: d.ref.one(() => organizations, 'orgId'),
          }),
        };

        // Force root to null while keeping entity in indirectlyScoped
        const graph = {
          root: null,
          levels: [],
          directlyScoped: [],
          indirectlyScoped: ['projects'],
          shared: [],
        };
        const chain = resolveTenantChain('projects', graph, registry);
        expect(chain).toBeNull();
      });
    });
  });

  describe('Given an indirectly scoped entity with a direct ref.one to the root table', () => {
    describe('When resolveTenantChain is called (seed phase reaches root)', () => {
      it('Then returns a chain where the FK is the tenant column', () => {
        const organizations = d
          .table('organizations', {
            id: d.uuid().primary(),
            name: d.text(),
          })
          .tenant();

        const items = d.table('root_ref_items', {
          id: d.uuid().primary(),
          orgId: d.uuid(),
          title: d.text(),
        });

        const registry = {
          organizations: d.model(organizations),
          items: d.model(items, {
            org: d.ref.one(() => organizations, 'orgId'),
          }),
        };

        // items would normally be directly scoped, but force it into indirectlyScoped
        const graph = {
          root: 'organizations',
          levels: [
            {
              key: 'organizations',
              tableName: 'organizations',
              parentFk: null,
              parentKey: null,
              depth: 0,
            },
          ],
          directlyScoped: [] as string[],
          indirectlyScoped: ['items'],
          shared: [],
        };

        const chain = resolveTenantChain('items', graph, registry);
        expect(chain).not.toBeNull();
        expect(chain!.hops).toHaveLength(1);
        expect(chain!.hops[0]!.tableName).toBe('organizations');
        expect(chain!.tenantColumn).toBe('orgId');
      });
    });
  });

  describe('Given a multi-hop chain where BFS reaches the root table', () => {
    describe('When resolveTenantChain resolves via BFS loop', () => {
      it('Then returns the chain with the correct tenant column', () => {
        const organizations = d
          .table('organizations', {
            id: d.uuid().primary(),
            name: d.text(),
          })
          .tenant();

        const departments = d.table('departments', {
          id: d.uuid().primary(),
          orgId: d.uuid(),
          name: d.text(),
        });

        const teams = d.table('teams', {
          id: d.uuid().primary(),
          deptId: d.uuid(),
          name: d.text(),
        });

        const registry = {
          organizations: d.model(organizations),
          departments: d.model(departments, {
            org: d.ref.one(() => organizations, 'orgId'),
          }),
          teams: d.model(teams, {
            dept: d.ref.one(() => departments, 'deptId'),
          }),
        };

        // Force departments out of directlyScoped so BFS must traverse through it to root
        const graph = {
          root: 'organizations',
          levels: [
            {
              key: 'organizations',
              tableName: 'organizations',
              parentFk: null,
              parentKey: null,
              depth: 0,
            },
          ],
          directlyScoped: [] as string[],
          indirectlyScoped: ['departments', 'teams'],
          shared: [],
        };

        const chain = resolveTenantChain('teams', graph, registry);
        expect(chain).not.toBeNull();
        expect(chain!.hops).toHaveLength(2);
        expect(chain!.hops[0]!.tableName).toBe('departments');
        expect(chain!.hops[1]!.tableName).toBe('organizations');
        // When BFS reaches root, the FK on the last hop IS the tenant column
        expect(chain!.tenantColumn).toBe('orgId');
      });
    });
  });

  describe('Given a cycle in the relation chain', () => {
    describe('When resolveTenantChain walks the chain', () => {
      it('Then detects the cycle and returns null', () => {
        const organizations = d
          .table('organizations', {
            id: d.uuid().primary(),
            name: d.text(),
          })
          .tenant();

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
          projects: d.model(projects, {
            org: d.ref.one(() => organizations, 'orgId'),
          }),
          tableA: d.model(tableA, {
            b: d.ref.one(() => tableB, 'bId'),
          }),
          tableB: d.model(tableB, {
            a: d.ref.one(() => tableA, 'aId'),
          }),
        };

        const graph = computeTenantGraph(registry);
        // Both tables reference each other — force into indirectlyScoped
        const cyclicGraph = {
          ...graph,
          indirectlyScoped: ['tableA', 'tableB'],
        };

        const chain = resolveTenantChain('tableA', cyclicGraph, registry);
        // Cycle detected via visited set → returns null
        expect(chain).toBeNull();
      });
    });
  });
});
