import { describe, expect, it } from 'bun:test';
import { d } from '../../d';
import { computeTenantGraph } from '../tenant-graph';

// ---------------------------------------------------------------------------
// Test schema: multi-tenant SaaS
// Tenant root is declared via .tenant() on the root table.
// ---------------------------------------------------------------------------

const organizations = d
  .table('organizations', {
    id: d.uuid().primary(),
    name: d.text(),
  })
  .tenant();

const users = d.table('users', {
  id: d.uuid().primary(),
  organizationId: d.uuid(),
  name: d.text(),
  email: d.text(),
});

const projects = d.table('projects', {
  id: d.uuid().primary(),
  organizationId: d.uuid(),
  name: d.text(),
});

const tasks = d.table('tasks', {
  id: d.uuid().primary(),
  projectId: d.uuid(),
  title: d.text(),
});

const comments = d.table('comments', {
  id: d.uuid().primary(),
  taskId: d.uuid(),
  body: d.text(),
});

const featureFlags = d
  .table('feature_flags', {
    id: d.uuid().primary(),
    name: d.text().unique(),
    enabled: d.boolean().default(false),
  })
  .shared();

const auditLogs = d.table('audit_logs', {
  id: d.uuid().primary(),
  action: d.text(),
  entityId: d.uuid(),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeTenantGraph', () => {
  it('identifies the tenant root table from .tenant()', () => {
    const registry = {
      organizations: d.model(organizations),
      users: d.model(users, {
        organization: d.ref.one(() => organizations, 'organizationId'),
      }),
    };

    const graph = computeTenantGraph(registry);
    expect(graph.root).toBe('organizations');
  });

  it('identifies directly scoped models (those with ref.one to root)', () => {
    const registry = {
      organizations: d.model(organizations),
      users: d.model(users, {
        organization: d.ref.one(() => organizations, 'organizationId'),
      }),
      projects: d.model(projects, {
        organization: d.ref.one(() => organizations, 'organizationId'),
      }),
    };

    const graph = computeTenantGraph(registry);
    expect(graph.directlyScoped).toContain('users');
    expect(graph.directlyScoped).toContain('projects');
    expect(graph.directlyScoped).not.toContain('organizations');
  });

  it('identifies indirectly scoped models (via relations to directly scoped)', () => {
    const registry = {
      organizations: d.model(organizations),
      projects: d.model(projects, {
        organization: d.ref.one(() => organizations, 'organizationId'),
      }),
      tasks: d.model(tasks, {
        project: d.ref.one(() => projects, 'projectId'),
      }),
    };

    const graph = computeTenantGraph(registry);
    expect(graph.indirectlyScoped).toContain('tasks');
  });

  it('traverses multi-hop indirect tenant paths', () => {
    const registry = {
      organizations: d.model(organizations),
      projects: d.model(projects, {
        organization: d.ref.one(() => organizations, 'organizationId'),
      }),
      tasks: d.model(tasks, {
        project: d.ref.one(() => projects, 'projectId'),
      }),
      comments: d.model(comments, {
        task: d.ref.one(() => tasks, 'taskId'),
      }),
    };

    const graph = computeTenantGraph(registry);
    expect(graph.indirectlyScoped).toContain('tasks');
    expect(graph.indirectlyScoped).toContain('comments');
  });

  it('identifies shared tables', () => {
    const registry = {
      organizations: d.model(organizations),
      featureFlags: d.model(featureFlags),
    };

    const graph = computeTenantGraph(registry);
    expect(graph.shared).toContain('featureFlags');
    expect(graph.shared).not.toContain('organizations');
  });

  it('returns tables without tenant path and not shared as unscoped', () => {
    const registry = {
      organizations: d.model(organizations),
      users: d.model(users, {
        organization: d.ref.one(() => organizations, 'organizationId'),
      }),
      auditLogs: d.model(auditLogs),
    };

    const graph = computeTenantGraph(registry);
    // auditLogs has no relation to scoped tables and is not shared
    expect(graph.directlyScoped).not.toContain('auditLogs');
    expect(graph.indirectlyScoped).not.toContain('auditLogs');
    expect(graph.shared).not.toContain('auditLogs');
  });

  it('root table is not in directlyScoped or indirectlyScoped', () => {
    const registry = {
      organizations: d.model(organizations),
      users: d.model(users, {
        organization: d.ref.one(() => organizations, 'organizationId'),
      }),
      projects: d.model(projects, {
        organization: d.ref.one(() => organizations, 'organizationId'),
      }),
    };

    const graph = computeTenantGraph(registry);
    expect(graph.directlyScoped).not.toContain('organizations');
    expect(graph.indirectlyScoped).not.toContain('organizations');
  });

  it('throws when multiple tables are marked .tenant()', () => {
    const otherRoot = d
      .table('other_root', {
        id: d.uuid().primary(),
        name: d.text(),
      })
      .tenant();

    const registry = {
      organizations: d.model(organizations),
      otherRoot: d.model(otherRoot),
    };

    expect(() => computeTenantGraph(registry)).toThrow('Multiple tables marked as .tenant()');
  });

  it('throws when a model has two ref.one relations to the tenant root', () => {
    const transfers = d.table('transfers', {
      id: d.uuid().primary(),
      fromOrgId: d.uuid(),
      toOrgId: d.uuid(),
      amount: d.integer(),
    });

    const registry = {
      organizations: d.model(organizations),
      transfers: d.model(transfers, {
        fromOrg: d.ref.one(() => organizations, 'fromOrgId'),
        toOrg: d.ref.one(() => organizations, 'toOrgId'),
      }),
    };

    expect(() => computeTenantGraph(registry)).toThrow('has 2 relations to tenant root');
  });

  it('throws when a table is both .tenant() and .shared()', () => {
    // Manually construct since chaining both isn't possible via the API
    // (tenant() resets shared, shared() resets tenant) — but test the validation
    const badTable = {
      _name: 'bad',
      _columns: {},
      _indexes: [],
      _shared: true,
      _tenant: true,
      get $infer() {
        return undefined as never;
      },
      get $infer_all() {
        return undefined as never;
      },
      get $insert() {
        return undefined as never;
      },
      get $update() {
        return undefined as never;
      },
      get $response() {
        return undefined as never;
      },
      get $create_input() {
        return undefined as never;
      },
      get $update_input() {
        return undefined as never;
      },
      shared() {
        return this;
      },
      tenant() {
        return this;
      },
    };

    const registry = {
      bad: { table: badTable, relations: {}, schemas: d.model(auditLogs).schemas },
    };

    expect(() => computeTenantGraph(registry)).toThrow('marked as both .tenant() and .shared()');
  });

  it('resolves indirect scoping when model has ref.one to a scoped table (alongside ref.many)', () => {
    const tags = d.table('tags', {
      id: d.uuid().primary(),
      name: d.text(),
    });

    const registry = {
      organizations: d.model(organizations),
      projects: d.model(projects, {
        organization: d.ref.one(() => organizations, 'organizationId'),
        tags: d.ref.many(() => tags, 'projectId'),
      }),
      tags: d.model(tags, {
        project: d.ref.one(() => projects, 'projectId'),
      }),
    };

    const graph = computeTenantGraph(registry);
    expect(graph.indirectlyScoped).toContain('tags');
  });

  it('does NOT classify a model as indirectly scoped when it only has ref.many to scoped tables', () => {
    const tags = d.table('tags', {
      id: d.uuid().primary(),
      projectId: d.uuid(),
      name: d.text(),
    });

    const registry = {
      organizations: d.model(organizations),
      projects: d.model(projects, {
        organization: d.ref.one(() => organizations, 'organizationId'),
        // ref.many to tags — does not make projects depend on tags for scoping
        tags: d.ref.many(() => tags, 'projectId'),
      }),
      // tags only has ref.many from projects — no ref.one to any scoped table
      tags: d.model(tags),
    };

    const graph = computeTenantGraph(registry);
    // tags should NOT be indirectly scoped since it has no ref.one path to a scoped table
    expect(graph.indirectlyScoped).not.toContain('tags');
  });

  it('returns null root when no .tenant() table exists', () => {
    const standalone = d.table('standalone', {
      id: d.uuid().primary(),
      name: d.text(),
    });

    const registry = {
      standalone: d.model(standalone),
    };

    const graph = computeTenantGraph(registry);
    expect(graph.root).toBeNull();
    expect(graph.directlyScoped).toEqual([]);
    expect(graph.indirectlyScoped).toEqual([]);
  });
});
