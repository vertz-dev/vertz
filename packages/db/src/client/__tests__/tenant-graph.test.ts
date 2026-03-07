import { describe, expect, it } from 'bun:test';
import { d } from '../../d';
import { computeTenantGraph } from '../tenant-graph';

// ---------------------------------------------------------------------------
// Test schema: multi-tenant SaaS
// Tenant scoping is declared at the model level via { tenant: 'relationName' }
// ---------------------------------------------------------------------------

const organizations = d.table('organizations', {
  id: d.uuid().primary(),
  name: d.text(),
});

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
  it('identifies the tenant root table', () => {
    const registry = {
      organizations: d.model(organizations),
      users: d.model(
        users,
        {
          organization: d.ref.one(() => organizations, 'organizationId'),
        },
        { tenant: 'organization' },
      ),
    };

    const graph = computeTenantGraph(registry);
    expect(graph.root).toBe('organizations');
  });

  it('identifies directly scoped tables (those with { tenant } option)', () => {
    const registry = {
      organizations: d.model(organizations),
      users: d.model(
        users,
        {
          organization: d.ref.one(() => organizations, 'organizationId'),
        },
        { tenant: 'organization' },
      ),
      projects: d.model(
        projects,
        {
          organization: d.ref.one(() => organizations, 'organizationId'),
        },
        { tenant: 'organization' },
      ),
    };

    const graph = computeTenantGraph(registry);
    expect(graph.directlyScoped).toContain('users');
    expect(graph.directlyScoped).toContain('projects');
    expect(graph.directlyScoped).not.toContain('organizations');
  });

  it('identifies indirectly scoped tables (via relations to directly scoped)', () => {
    const registry = {
      organizations: d.model(organizations),
      projects: d.model(
        projects,
        {
          organization: d.ref.one(() => organizations, 'organizationId'),
        },
        { tenant: 'organization' },
      ),
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
      projects: d.model(
        projects,
        {
          organization: d.ref.one(() => organizations, 'organizationId'),
        },
        { tenant: 'organization' },
      ),
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
      users: d.model(
        users,
        {
          organization: d.ref.one(() => organizations, 'organizationId'),
        },
        { tenant: 'organization' },
      ),
      auditLogs: d.model(auditLogs),
    };

    const graph = computeTenantGraph(registry);
    // auditLogs has no tenant relation, no relation to scoped tables, and is not shared
    expect(graph.directlyScoped).not.toContain('auditLogs');
    expect(graph.indirectlyScoped).not.toContain('auditLogs');
    expect(graph.shared).not.toContain('auditLogs');
  });

  it('root table is not in directlyScoped or indirectlyScoped', () => {
    const registry = {
      organizations: d.model(organizations),
      users: d.model(
        users,
        {
          organization: d.ref.one(() => organizations, 'organizationId'),
        },
        { tenant: 'organization' },
      ),
      projects: d.model(
        projects,
        {
          organization: d.ref.one(() => organizations, 'organizationId'),
        },
        { tenant: 'organization' },
      ),
    };

    const graph = computeTenantGraph(registry);
    expect(graph.directlyScoped).not.toContain('organizations');
    expect(graph.indirectlyScoped).not.toContain('organizations');
  });

  it('throws when multiple tenant declarations point to different roots', () => {
    const otherRoot = d.table('other_root', {
      id: d.uuid().primary(),
      name: d.text(),
    });

    const registry = {
      organizations: d.model(organizations),
      otherRoot: d.model(otherRoot),
      users: d.model(
        users,
        {
          organization: d.ref.one(() => organizations, 'organizationId'),
        },
        { tenant: 'organization' },
      ),
      projects: d.model(
        projects,
        {
          other: d.ref.one(() => otherRoot, 'organizationId'),
        },
        { tenant: 'other' },
      ),
    };

    expect(() => computeTenantGraph(registry)).toThrow('Conflicting tenant roots');
  });

  it('throws when _tenant references a non-existent relation', () => {
    const registry = {
      organizations: d.model(organizations),
      users: {
        table: users,
        relations: {},
        _tenant: 'organization', // relation doesn't exist
        schemas: d.model(users).schemas,
      },
    };

    expect(() => computeTenantGraph(registry)).toThrow('tenant relation "organization" not found');
  });

  it('resolves indirect scoping via ref.many', () => {
    const tags = d.table('tags', {
      id: d.uuid().primary(),
      name: d.text(),
    });

    const registry = {
      organizations: d.model(organizations),
      projects: d.model(
        projects,
        {
          organization: d.ref.one(() => organizations, 'organizationId'),
          tags: d.ref.many(() => tags, 'projectId'),
        },
        { tenant: 'organization' },
      ),
      tags: d.model(tags, {
        project: d.ref.one(() => projects, 'projectId'),
      }),
    };

    const graph = computeTenantGraph(registry);
    expect(graph.indirectlyScoped).toContain('tags');
  });

  it('returns null root when no tenant options exist', () => {
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
