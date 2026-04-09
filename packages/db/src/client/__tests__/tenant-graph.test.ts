import { describe, expect, it } from '@vertz/test';
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

  it('throws when multiple .tenant() tables have no FK chain between them', () => {
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

    expect(() => computeTenantGraph(registry)).toThrow('do not form a single FK chain');
  });

  // ---------------------------------------------------------------------------
  // Multi-level tenancy (#1787)
  // ---------------------------------------------------------------------------

  it('accepts two .tenant() tables linked by ref.one and produces levels', () => {
    const accounts = d.table('accounts', { id: d.uuid().primary(), name: d.text() }).tenant();
    const mlProjects = d
      .table('ml_projects', {
        id: d.uuid().primary(),
        accountId: d.uuid(),
        name: d.text(),
      })
      .tenant();

    const registry = {
      accounts: d.model(accounts),
      mlProjects: d.model(mlProjects, {
        account: d.ref.one(() => accounts, 'accountId'),
      }),
    };

    const graph = computeTenantGraph(registry);
    expect(graph.root).toBe('accounts');
    expect(graph.levels).toHaveLength(2);
    expect(graph.levels[0]).toEqual({
      key: 'accounts',
      tableName: 'accounts',
      parentFk: null,
      parentKey: null,
      depth: 0,
    });
    expect(graph.levels[1]).toEqual({
      key: 'mlProjects',
      tableName: 'ml_projects',
      parentFk: 'accountId',
      parentKey: 'accounts',
      depth: 1,
    });
  });

  it('produces a single-entry levels array for a single .tenant() table', () => {
    const registry = {
      organizations: d.model(organizations),
      users: d.model(users, {
        organization: d.ref.one(() => organizations, 'organizationId'),
      }),
    };

    const graph = computeTenantGraph(registry);
    expect(graph.root).toBe('organizations');
    expect(graph.levels).toHaveLength(1);
    expect(graph.levels[0]).toEqual({
      key: 'organizations',
      tableName: 'organizations',
      parentFk: null,
      parentKey: null,
      depth: 0,
    });
  });

  it('accepts a 3-level .tenant() chain', () => {
    const accounts = d.table('accounts', { id: d.uuid().primary(), name: d.text() }).tenant();
    const mlProjects = d
      .table('ml_projects', {
        id: d.uuid().primary(),
        accountId: d.uuid(),
        name: d.text(),
      })
      .tenant();
    const customerTenants = d
      .table('customer_tenants', {
        id: d.uuid().primary(),
        projectId: d.uuid(),
        name: d.text(),
      })
      .tenant();

    const registry = {
      accounts: d.model(accounts),
      mlProjects: d.model(mlProjects, {
        account: d.ref.one(() => accounts, 'accountId'),
      }),
      customerTenants: d.model(customerTenants, {
        project: d.ref.one(() => mlProjects, 'projectId'),
      }),
    };

    const graph = computeTenantGraph(registry);
    expect(graph.root).toBe('accounts');
    expect(graph.levels).toHaveLength(3);
    expect(graph.levels[0].key).toBe('accounts');
    expect(graph.levels[0].depth).toBe(0);
    expect(graph.levels[1].key).toBe('mlProjects');
    expect(graph.levels[1].depth).toBe(1);
    expect(graph.levels[1].parentKey).toBe('accounts');
    expect(graph.levels[2].key).toBe('customerTenants');
    expect(graph.levels[2].depth).toBe(2);
    expect(graph.levels[2].parentKey).toBe('mlProjects');
  });

  it('throws when .tenant() chain exceeds 4 levels', () => {
    const l1 = d.table('l1', { id: d.uuid().primary() }).tenant();
    const l2 = d.table('l2', { id: d.uuid().primary(), l1Id: d.uuid() }).tenant();
    const l3 = d.table('l3', { id: d.uuid().primary(), l2Id: d.uuid() }).tenant();
    const l4 = d.table('l4', { id: d.uuid().primary(), l3Id: d.uuid() }).tenant();
    const l5 = d.table('l5', { id: d.uuid().primary(), l4Id: d.uuid() }).tenant();

    const registry = {
      l1: d.model(l1),
      l2: d.model(l2, { parent: d.ref.one(() => l1, 'l1Id') }),
      l3: d.model(l3, { parent: d.ref.one(() => l2, 'l2Id') }),
      l4: d.model(l4, { parent: d.ref.one(() => l3, 'l3Id') }),
      l5: d.model(l5, { parent: d.ref.one(() => l4, 'l4Id') }),
    };

    expect(() => computeTenantGraph(registry)).toThrow('exceeds maximum of 4 levels');
  });

  it('throws when .tenant() tables form a fork (not a single chain)', () => {
    const accounts = d.table('accounts', { id: d.uuid().primary() }).tenant();
    const projectsA = d
      .table('projects_a', { id: d.uuid().primary(), accountId: d.uuid() })
      .tenant();
    const projectsB = d
      .table('projects_b', { id: d.uuid().primary(), accountId: d.uuid() })
      .tenant();

    const registry = {
      accounts: d.model(accounts),
      projectsA: d.model(projectsA, {
        account: d.ref.one(() => accounts, 'accountId'),
      }),
      projectsB: d.model(projectsB, {
        account: d.ref.one(() => accounts, 'accountId'),
      }),
    };

    expect(() => computeTenantGraph(registry)).toThrow('do not form a single FK chain');
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
