import { describe, expect, it } from 'vitest';
import { d } from '../../d';
import { computeTenantGraph } from '../tenant-graph';

// ---------------------------------------------------------------------------
// Test schema: multi-tenant SaaS
// ---------------------------------------------------------------------------

const organizations = d.table('organizations', {
  id: d.uuid().primary(),
  name: d.text(),
});

const users = d.table('users', {
  id: d.uuid().primary(),
  organizationId: d.tenant(organizations),
  name: d.text(),
  email: d.email(),
});

const projects = d.table('projects', {
  id: d.uuid().primary(),
  organizationId: d.tenant(organizations),
  name: d.text(),
});

const tasks = d.table('tasks', {
  id: d.uuid().primary(),
  projectId: d.uuid().references('projects', 'id'),
  title: d.text(),
});

const comments = d.table('comments', {
  id: d.uuid().primary(),
  taskId: d.uuid().references('tasks', 'id'),
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
      organizations: { table: organizations, relations: {} },
      users: { table: users, relations: {} },
    };

    const graph = computeTenantGraph(registry);
    expect(graph.root).toBe('organizations');
  });

  it('identifies directly scoped tables (those with d.tenant())', () => {
    const registry = {
      organizations: { table: organizations, relations: {} },
      users: { table: users, relations: {} },
      projects: { table: projects, relations: {} },
    };

    const graph = computeTenantGraph(registry);
    expect(graph.directlyScoped).toContain('users');
    expect(graph.directlyScoped).toContain('projects');
    expect(graph.directlyScoped).not.toContain('organizations');
  });

  it('identifies indirectly scoped tables (via references to directly scoped)', () => {
    const registry = {
      organizations: { table: organizations, relations: {} },
      projects: { table: projects, relations: {} },
      tasks: { table: tasks, relations: {} },
    };

    const graph = computeTenantGraph(registry);
    expect(graph.indirectlyScoped).toContain('tasks');
  });

  it('traverses multi-hop indirect tenant paths', () => {
    const registry = {
      organizations: { table: organizations, relations: {} },
      projects: { table: projects, relations: {} },
      tasks: { table: tasks, relations: {} },
      comments: { table: comments, relations: {} },
    };

    const graph = computeTenantGraph(registry);
    expect(graph.indirectlyScoped).toContain('tasks');
    expect(graph.indirectlyScoped).toContain('comments');
  });

  it('identifies shared tables', () => {
    const registry = {
      organizations: { table: organizations, relations: {} },
      featureFlags: { table: featureFlags, relations: {} },
    };

    const graph = computeTenantGraph(registry);
    expect(graph.shared).toContain('featureFlags');
    expect(graph.shared).not.toContain('organizations');
  });

  it('returns tables without tenant path and not shared as unscoped', () => {
    const registry = {
      organizations: { table: organizations, relations: {} },
      users: { table: users, relations: {} },
      auditLogs: { table: auditLogs, relations: {} },
    };

    const graph = computeTenantGraph(registry);
    // auditLogs has no tenant column, no references to scoped tables, and is not shared
    expect(graph.directlyScoped).not.toContain('auditLogs');
    expect(graph.indirectlyScoped).not.toContain('auditLogs');
    expect(graph.shared).not.toContain('auditLogs');
  });

  it('root table is not in directlyScoped or indirectlyScoped', () => {
    const registry = {
      organizations: { table: organizations, relations: {} },
      users: { table: users, relations: {} },
      projects: { table: projects, relations: {} },
    };

    const graph = computeTenantGraph(registry);
    expect(graph.directlyScoped).not.toContain('organizations');
    expect(graph.indirectlyScoped).not.toContain('organizations');
  });

  it('returns null root when no tenant columns exist', () => {
    const standalone = d.table('standalone', {
      id: d.uuid().primary(),
      name: d.text(),
    });

    const registry = {
      standalone: { table: standalone, relations: {} },
    };

    const graph = computeTenantGraph(registry);
    expect(graph.root).toBeNull();
    expect(graph.directlyScoped).toEqual([]);
    expect(graph.indirectlyScoped).toEqual([]);
  });
});
