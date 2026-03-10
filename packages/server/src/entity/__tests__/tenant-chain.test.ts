import { describe, expect, it } from 'bun:test';
import { computeTenantGraph, d } from '@vertz/db';
import { resolveTenantChain } from '../tenant-chain';

// ---------------------------------------------------------------------------
// Test schema: multi-tenant SaaS with indirect scoping
// ---------------------------------------------------------------------------

const organizations = d.table('organizations', {
  id: d.uuid().primary(),
  name: d.text(),
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
    name: d.text(),
  })
  .shared();

const auditLogs = d.table('audit_logs', {
  id: d.uuid().primary(),
  action: d.text(),
});

// ---------------------------------------------------------------------------
// Model registry (same structure passed to createDb)
// ---------------------------------------------------------------------------

const registry = {
  organizations: d.model(organizations),
  projects: d.model(
    projects,
    { organization: d.ref.one(() => organizations, 'organizationId') },
    { tenant: 'organization' },
  ),
  tasks: d.model(tasks, {
    project: d.ref.one(() => projects, 'projectId'),
  }),
  comments: d.model(comments, {
    task: d.ref.one(() => tasks, 'taskId'),
  }),
  featureFlags: d.model(featureFlags),
  auditLogs: d.model(auditLogs),
};

const tenantGraph = computeTenantGraph(registry);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveTenantChain', () => {
  it('returns a chain with one hop for single-hop indirect entity (tasks → projects)', () => {
    const chain = resolveTenantChain('tasks', tenantGraph, registry);

    expect(chain).not.toBeNull();
    expect(chain!.hops).toHaveLength(1);
    expect(chain!.hops[0]).toEqual({
      tableName: 'projects',
      foreignKey: 'projectId',
      targetColumn: 'id',
    });
    expect(chain!.tenantColumn).toBe('organizationId');
  });

  it('returns a chain with two hops for multi-hop indirect entity (comments → tasks → projects)', () => {
    const chain = resolveTenantChain('comments', tenantGraph, registry);

    expect(chain).not.toBeNull();
    expect(chain!.hops).toHaveLength(2);
    expect(chain!.hops[0]).toEqual({
      tableName: 'tasks',
      foreignKey: 'taskId',
      targetColumn: 'id',
    });
    expect(chain!.hops[1]).toEqual({
      tableName: 'projects',
      foreignKey: 'projectId',
      targetColumn: 'id',
    });
    expect(chain!.tenantColumn).toBe('organizationId');
  });

  it('returns null for directly scoped entity (projects — handled by existing direct scoping)', () => {
    const chain = resolveTenantChain('projects', tenantGraph, registry);
    expect(chain).toBeNull();
  });

  it('returns null for tenant root entity (organizations)', () => {
    const chain = resolveTenantChain('organizations', tenantGraph, registry);
    expect(chain).toBeNull();
  });

  it('returns null for shared entity (featureFlags)', () => {
    const chain = resolveTenantChain('featureFlags', tenantGraph, registry);
    expect(chain).toBeNull();
  });

  it('returns null for unscoped entity (auditLogs)', () => {
    const chain = resolveTenantChain('auditLogs', tenantGraph, registry);
    expect(chain).toBeNull();
  });

  it('returns null when tenantGraph has no root', () => {
    const noTenantRegistry = {
      standalone: d.model(d.table('standalone', { id: d.uuid().primary(), name: d.text() })),
    };
    const noTenantGraph = computeTenantGraph(noTenantRegistry);
    const chain = resolveTenantChain('standalone', noTenantGraph, noTenantRegistry);
    expect(chain).toBeNull();
  });

  it('resolves tenant column from the directly-scoped model _tenant relation', () => {
    // The tenant column should come from the relation's FK on the directly-scoped model,
    // not from a hardcoded 'tenantId'
    const customOrgs = d.table('orgs', {
      id: d.uuid().primary(),
      name: d.text(),
    });
    const customProjects = d.table('custom_projects', {
      id: d.uuid().primary(),
      orgId: d.uuid(),
      name: d.text(),
    });
    const customTasks = d.table('custom_tasks', {
      id: d.uuid().primary(),
      projectId: d.uuid(),
      title: d.text(),
    });

    const customRegistry = {
      orgs: d.model(customOrgs),
      projects: d.model(
        customProjects,
        { org: d.ref.one(() => customOrgs, 'orgId') },
        { tenant: 'org' },
      ),
      tasks: d.model(customTasks, {
        project: d.ref.one(() => customProjects, 'projectId'),
      }),
    };
    const customGraph = computeTenantGraph(customRegistry);
    const chain = resolveTenantChain('tasks', customGraph, customRegistry);

    expect(chain).not.toBeNull();
    expect(chain!.tenantColumn).toBe('orgId');
  });
});
