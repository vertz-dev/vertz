import { describe, expect, it } from 'bun:test';
import { computeTenantGraph, d } from '@vertz/db';
import { resolveTenantChain } from '../tenant-chain';

// ---------------------------------------------------------------------------
// Test schema: multi-tenant SaaS with indirect scoping
// Tenant root is declared via .tenant() on the root table.
// ---------------------------------------------------------------------------

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
  projects: d.model(projects, {
    organization: d.ref.one(() => organizations, 'organizationId'),
  }),
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

  it('resolves tenant column from the directly-scoped model ref.one to root', () => {
    // The tenant column should come from the relation's FK on the directly-scoped model
    const customOrgs = d
      .table('orgs', {
        id: d.uuid().primary(),
        name: d.text(),
      })
      .tenant();
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
      projects: d.model(customProjects, {
        org: d.ref.one(() => customOrgs, 'orgId'),
      }),
      tasks: d.model(customTasks, {
        project: d.ref.one(() => customProjects, 'projectId'),
      }),
    };
    const customGraph = computeTenantGraph(customRegistry);
    const chain = resolveTenantChain('tasks', customGraph, customRegistry);

    expect(chain).not.toBeNull();
    expect(chain!.tenantColumn).toBe('orgId');
  });

  it('picks the shortest path when multiple paths exist (BFS)', () => {
    // reactions has ref.one to both comments (2 hops to directly-scoped)
    // and directly to projects (1 hop to directly-scoped)
    const reactions = d.table('reactions', {
      id: d.uuid().primary(),
      commentId: d.uuid(),
      projectId: d.uuid(),
      emoji: d.text(),
    });

    const multiPathRegistry = {
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
      reactions: d.model(reactions, {
        comment: d.ref.one(() => comments, 'commentId'),
        project: d.ref.one(() => projects, 'projectId'),
      }),
    };
    const multiPathGraph = computeTenantGraph(multiPathRegistry);
    const chain = resolveTenantChain('reactions', multiPathGraph, multiPathRegistry);

    expect(chain).not.toBeNull();
    // Should pick reactions → projects (1 hop) over reactions → comments → tasks → projects (3 hops)
    expect(chain!.hops).toHaveLength(1);
    expect(chain!.hops[0].tableName).toBe('projects');
    expect(chain!.tenantColumn).toBe('organizationId');
  });

  it('throws when a table in the chain has a composite primary key', () => {
    const customOrgs = d
      .table('orgs', {
        id: d.uuid().primary(),
        name: d.text(),
      })
      .tenant();

    // Composite PK table in the chain
    const memberships = d.table(
      'memberships',
      {
        orgId: d.uuid(),
        userId: d.uuid(),
        role: d.text(),
      },
      { primaryKey: ['orgId', 'userId'] },
    );

    const assignments = d.table('assignments', {
      id: d.uuid().primary(),
      membershipOrgId: d.uuid(),
      title: d.text(),
    });

    const compositePkRegistry = {
      orgs: d.model(customOrgs),
      memberships: d.model(memberships, {
        org: d.ref.one(() => customOrgs, 'orgId'),
      }),
      assignments: d.model(assignments, {
        membership: d.ref.one(() => memberships, 'membershipOrgId'),
      }),
    };
    const compositePkGraph = computeTenantGraph(compositePkRegistry);

    expect(() => resolveTenantChain('assignments', compositePkGraph, compositePkRegistry)).toThrow(
      /composite primary key on table "memberships"/i,
    );
  });

  it('ignores shared tables during traversal', () => {
    // taskItems has ref.one to both projects (scoped) and templates (shared)
    const templates = d
      .table('templates', {
        id: d.uuid().primary(),
        name: d.text(),
      })
      .shared();

    const taskItems = d.table('task_items', {
      id: d.uuid().primary(),
      projectId: d.uuid(),
      templateId: d.uuid(),
      title: d.text(),
    });

    const sharedRegistry = {
      organizations: d.model(organizations),
      projects: d.model(projects, {
        organization: d.ref.one(() => organizations, 'organizationId'),
      }),
      templates: d.model(templates),
      taskItems: d.model(taskItems, {
        template: d.ref.one(() => templates, 'templateId'),
        project: d.ref.one(() => projects, 'projectId'),
      }),
    };
    const sharedGraph = computeTenantGraph(sharedRegistry);
    const chain = resolveTenantChain('taskItems', sharedGraph, sharedRegistry);

    expect(chain).not.toBeNull();
    // Should scope through projects, NOT templates (shared)
    expect(chain!.hops[0].tableName).toBe('projects');
    expect(chain!.tenantColumn).toBe('organizationId');
  });

  // ---------------------------------------------------------------------------
  // Multi-level tenancy (#1787) — chain resolution through tenant levels
  // ---------------------------------------------------------------------------

  describe('multi-level tenant hierarchy', () => {
    // 2-level: accounts (root) → projects (tenant level 1)
    const mlAccounts = d.table('ml_accounts', { id: d.uuid().primary(), name: d.text() }).tenant();
    const mlProjects = d
      .table('ml_projects', { id: d.uuid().primary(), accountId: d.uuid(), name: d.text() })
      .tenant();
    const mlTasks = d.table('ml_tasks', {
      id: d.uuid().primary(),
      projectId: d.uuid(),
      title: d.text(),
    });

    const mlRegistry = {
      accounts: d.model(mlAccounts),
      projects: d.model(mlProjects, {
        account: d.ref.one(() => mlAccounts, 'accountId'),
      }),
      tasks: d.model(mlTasks, {
        project: d.ref.one(() => mlProjects, 'projectId'),
      }),
    };

    const mlGraph = computeTenantGraph(mlRegistry);

    it('classifies entity with ref.one to non-root tenant level as indirectlyScoped', () => {
      // tasks → projects (tenant level), NOT directly to accounts (root)
      expect(mlGraph.indirectlyScoped).toContain('tasks');
      expect(mlGraph.directlyScoped).not.toContain('tasks');
    });

    it('resolves chain through a non-root tenant level (tasks → projects → accounts)', () => {
      const chain = resolveTenantChain('tasks', mlGraph, mlRegistry);

      expect(chain).not.toBeNull();
      expect(chain!.hops).toHaveLength(1);
      expect(chain!.hops[0]).toEqual({
        tableName: 'ml_projects',
        foreignKey: 'projectId',
        targetColumn: 'id',
      });
      // tenantColumn is the FK from projects (non-root tenant level) to accounts (root)
      expect(chain!.tenantColumn).toBe('accountId');
    });

    it('resolves multi-hop chain through tenant levels (comments → tasks → projects)', () => {
      const mlComments = d.table('ml_comments', {
        id: d.uuid().primary(),
        taskId: d.uuid(),
        body: d.text(),
      });

      const extRegistry = {
        ...mlRegistry,
        comments: d.model(mlComments, {
          task: d.ref.one(() => mlTasks, 'taskId'),
        }),
      };

      const extGraph = computeTenantGraph(extRegistry);
      const chain = resolveTenantChain('comments', extGraph, extRegistry);

      expect(chain).not.toBeNull();
      expect(chain!.hops).toHaveLength(2);
      expect(chain!.hops[0]).toEqual({
        tableName: 'ml_tasks',
        foreignKey: 'taskId',
        targetColumn: 'id',
      });
      expect(chain!.hops[1]).toEqual({
        tableName: 'ml_projects',
        foreignKey: 'projectId',
        targetColumn: 'id',
      });
      expect(chain!.tenantColumn).toBe('accountId');
    });

    it('resolves chain in 3-level hierarchy (tasks → customerTenants → projects → accounts)', () => {
      const mlCustomerTenants = d
        .table('ml_customer_tenants', {
          id: d.uuid().primary(),
          projectId: d.uuid(),
          name: d.text(),
        })
        .tenant();

      const mlDeepTasks = d.table('ml_deep_tasks', {
        id: d.uuid().primary(),
        customerTenantId: d.uuid(),
        title: d.text(),
      });

      const threeLevel = {
        accounts: d.model(mlAccounts),
        projects: d.model(mlProjects, {
          account: d.ref.one(() => mlAccounts, 'accountId'),
        }),
        customerTenants: d.model(mlCustomerTenants, {
          project: d.ref.one(() => mlProjects, 'projectId'),
        }),
        tasks: d.model(mlDeepTasks, {
          customerTenant: d.ref.one(() => mlCustomerTenants, 'customerTenantId'),
        }),
      };

      const threeLevelGraph = computeTenantGraph(threeLevel);
      const chain = resolveTenantChain('tasks', threeLevelGraph, threeLevel);

      expect(chain).not.toBeNull();
      expect(chain!.hops).toHaveLength(2);
      expect(chain!.hops[0]).toEqual({
        tableName: 'ml_customer_tenants',
        foreignKey: 'customerTenantId',
        targetColumn: 'id',
      });
      expect(chain!.hops[1]).toEqual({
        tableName: 'ml_projects',
        foreignKey: 'projectId',
        targetColumn: 'id',
      });
      expect(chain!.tenantColumn).toBe('accountId');
    });

    it('returns null for non-root tenant level entities (they are tenant levels, not consumers)', () => {
      // projects is a .tenant() level — not in directlyScoped or indirectlyScoped
      const chain = resolveTenantChain('projects', mlGraph, mlRegistry);
      expect(chain).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Composite PK as chain origin (#1776)
  // ---------------------------------------------------------------------------

  describe('composite PK entity as chain origin', () => {
    const cpkOrgs = d
      .table('cpk_organizations', {
        id: d.uuid().primary(),
        name: d.text(),
      })
      .tenant();

    const cpkProjects = d.table('cpk_projects', {
      id: d.uuid().primary(),
      organizationId: d.uuid(),
      name: d.text(),
    });

    const cpkProjectMembers = d.table(
      'cpk_project_members',
      {
        projectId: d.uuid(),
        userId: d.uuid(),
        role: d.text().default('member'),
      },
      { primaryKey: ['projectId', 'userId'] },
    );

    const cpkRegistry = {
      organizations: d.model(cpkOrgs),
      projects: d.model(cpkProjects, {
        organization: d.ref.one(() => cpkOrgs, 'organizationId'),
      }),
      projectMembers: d.model(cpkProjectMembers, {
        project: d.ref.one(() => cpkProjects, 'projectId'),
      }),
    };

    const cpkGraph = computeTenantGraph(cpkRegistry);

    it('resolves chain from composite-PK entity to root', () => {
      const chain = resolveTenantChain('projectMembers', cpkGraph, cpkRegistry);

      expect(chain).not.toBeNull();
      expect(chain!.hops).toHaveLength(1);
      expect(chain!.hops[0]).toEqual({
        tableName: 'cpk_projects',
        foreignKey: 'projectId',
        targetColumn: 'id',
      });
      expect(chain!.tenantColumn).toBe('organizationId');
    });

    it('chain hops target single-PK tables only', () => {
      const chain = resolveTenantChain('projectMembers', cpkGraph, cpkRegistry);

      for (const hop of chain!.hops) {
        expect(typeof hop.targetColumn).toBe('string');
      }
    });

    it('resolves multi-hop chain from composite-PK entity through intermediates', () => {
      // Add an extra hop: cpk_project_members → cpk_tasks → cpk_projects → cpk_organizations
      const cpkTasks = d.table('cpk_tasks', {
        id: d.uuid().primary(),
        projectId: d.uuid(),
        title: d.text(),
      });

      const cpkTaskAssignments = d.table(
        'cpk_task_assignments',
        {
          taskId: d.uuid(),
          userId: d.uuid(),
          assignedAt: d.timestamp().default('now').readOnly(),
        },
        { primaryKey: ['taskId', 'userId'] },
      );

      const multiHopRegistry = {
        organizations: d.model(cpkOrgs),
        projects: d.model(cpkProjects, {
          organization: d.ref.one(() => cpkOrgs, 'organizationId'),
        }),
        tasks: d.model(cpkTasks, {
          project: d.ref.one(() => cpkProjects, 'projectId'),
        }),
        taskAssignments: d.model(cpkTaskAssignments, {
          task: d.ref.one(() => cpkTasks, 'taskId'),
        }),
      };

      const multiHopGraph = computeTenantGraph(multiHopRegistry);
      const chain = resolveTenantChain('taskAssignments', multiHopGraph, multiHopRegistry);

      expect(chain).not.toBeNull();
      expect(chain!.hops).toHaveLength(2);
      expect(chain!.hops[0]).toEqual({
        tableName: 'cpk_tasks',
        foreignKey: 'taskId',
        targetColumn: 'id',
      });
      expect(chain!.hops[1]).toEqual({
        tableName: 'cpk_projects',
        foreignKey: 'projectId',
        targetColumn: 'id',
      });
      expect(chain!.tenantColumn).toBe('organizationId');
    });
  });

  // ---------------------------------------------------------------------------
  // Composite PK as intermediate hop — error messages (#1776)
  // ---------------------------------------------------------------------------

  describe('composite PK as intermediate hop — error messages', () => {
    it('error message explains ref.one single-column FK limitation', () => {
      const errOrgs = d
        .table('err_orgs', {
          id: d.uuid().primary(),
          name: d.text(),
        })
        .tenant();

      const errMemberships = d.table(
        'err_memberships',
        {
          orgId: d.uuid(),
          userId: d.uuid(),
          role: d.text(),
        },
        { primaryKey: ['orgId', 'userId'] },
      );

      const errAssignments = d.table('err_assignments', {
        id: d.uuid().primary(),
        membershipOrgId: d.uuid(),
        title: d.text(),
      });

      const errRegistry = {
        orgs: d.model(errOrgs),
        memberships: d.model(errMemberships, {
          org: d.ref.one(() => errOrgs, 'orgId'),
        }),
        assignments: d.model(errAssignments, {
          membership: d.ref.one(() => errMemberships, 'membershipOrgId'),
        }),
      };
      const errGraph = computeTenantGraph(errRegistry);

      try {
        resolveTenantChain('assignments', errGraph, errRegistry);
        expect.unreachable('should have thrown');
      } catch (e) {
        const msg = (e as Error).message;
        expect(msg).toContain('ref.one() creates single-column foreign keys');
        expect(msg).toContain('CAN be the chain origin');
        expect(msg).toContain('use a surrogate single-column PK');
      }
    });
  });
});
