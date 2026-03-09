import { describe, expect, it } from 'bun:test';
import type { ResourceRef } from '../access-context';
import { createAccessContext } from '../access-context';
import { calculateBillingPeriod } from '../billing-period';
import { InMemoryClosureStore } from '../closure-store';
import { defineAccess } from '../define-access';
import { InMemoryFlagStore } from '../flag-store';
import { InMemoryPlanStore } from '../plan-store';
import { InMemoryPlanVersionStore } from '../plan-version-store';
import { InMemoryRoleAssignmentStore } from '../role-assignment-store';
import { InMemoryWalletStore } from '../wallet-store';

async function setup() {
  const accessDef = defineAccess({
    entities: {
      organization: { roles: ['owner', 'admin', 'member'] },
      team: {
        roles: ['lead', 'editor', 'viewer'],
        inherits: {
          'organization:owner': 'lead',
          'organization:admin': 'editor',
          'organization:member': 'viewer',
        },
      },
      project: {
        roles: ['manager', 'contributor', 'viewer'],
        inherits: {
          'team:lead': 'manager',
          'team:editor': 'contributor',
          'team:viewer': 'viewer',
        },
      },
      task: {
        roles: ['assignee', 'viewer'],
        inherits: {
          'project:manager': 'assignee',
          'project:contributor': 'assignee',
          'project:viewer': 'viewer',
        },
      },
    },
    entitlements: {
      'project:view': { roles: ['viewer', 'contributor', 'manager'] },
      'project:edit': { roles: ['contributor', 'manager'] },
      'project:delete': { roles: ['manager'] },
      'project:export': { roles: ['manager'], flags: ['export-v2'] },
      'task:view': { roles: ['viewer', 'assignee'] },
      'task:edit': { roles: ['assignee'] },
    },
  });

  const closureStore = new InMemoryClosureStore();
  const roleStore = new InMemoryRoleAssignmentStore();

  // Build resource hierarchy
  await closureStore.addResource('organization', 'org-1');
  await closureStore.addResource('team', 'team-1', {
    parentType: 'organization',
    parentId: 'org-1',
  });
  await closureStore.addResource('project', 'proj-1', {
    parentType: 'team',
    parentId: 'team-1',
  });
  await closureStore.addResource('task', 'task-1', {
    parentType: 'project',
    parentId: 'proj-1',
  });

  return { accessDef, closureStore, roleStore };
}

describe('createAccessContext', () => {
  describe('can()', () => {
    it('returns true when user role grants entitlement on resource', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'project', 'proj-1', 'manager');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      const result = await ctx.can('project:edit', {
        type: 'project',
        id: 'proj-1',
      });
      expect(result).toBe(true);
    });

    it('returns false when user lacks required role', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'project', 'proj-1', 'viewer');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      const result = await ctx.can('project:edit', {
        type: 'project',
        id: 'proj-1',
      });
      expect(result).toBe(false);
    });

    it('returns false for unauthenticated user', async () => {
      const { accessDef, closureStore, roleStore } = await setup();

      const ctx = createAccessContext({
        userId: null,
        accessDef,
        closureStore,
        roleStore,
      });

      const result = await ctx.can('project:view', {
        type: 'project',
        id: 'proj-1',
      });
      expect(result).toBe(false);
    });

    it('resolves inherited roles via hierarchy', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
      // admin on org → editor on team → contributor on project

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      const result = await ctx.can('project:edit', {
        type: 'project',
        id: 'proj-1',
      });
      expect(result).toBe(true); // contributor can edit
    });

    it('denies when inherited role is insufficient', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'organization', 'org-1', 'member');
      // member on org → viewer on team → viewer on project

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      const result = await ctx.can('project:edit', {
        type: 'project',
        id: 'proj-1',
      });
      expect(result).toBe(false); // viewer cannot edit
    });

    it('plan check skipped when no planStore configured (backward compat)', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'project', 'proj-1', 'manager');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      // project:export requires flags: ['export-v2']
      // Without flagStore configured, flag check is skipped
      const result = await ctx.can('project:export', {
        type: 'project',
        id: 'proj-1',
      });
      expect(result).toBe(true);
    });
  });

  describe('plan layer (Layer 3 — plan features)', () => {
    async function setupWithPlans() {
      const accessDef = defineAccess({
        entities: {
          organization: { roles: ['owner', 'admin', 'member'] },
          project: {
            roles: ['manager', 'contributor', 'viewer'],
            inherits: {
              'organization:owner': 'manager',
              'organization:admin': 'contributor',
              'organization:member': 'viewer',
            },
          },
        },
        entitlements: {
          'organization:create-project': { roles: ['admin', 'owner'] },
          'project:view': { roles: ['viewer', 'contributor', 'manager'] },
          'project:export': { roles: ['manager'] },
        },
        plans: {
          free: {
            group: 'main',
            features: ['organization:create-project', 'project:view'],
          },
          pro: {
            group: 'main',
            features: ['organization:create-project', 'project:view', 'project:export'],
            limits: {
              project_creates: {
                max: 10,
                gates: 'organization:create-project',
                per: 'month',
              },
            },
          },
        },
      });

      const closureStore = new InMemoryClosureStore();
      const roleStore = new InMemoryRoleAssignmentStore();
      const planStore = new InMemoryPlanStore();
      const walletStore = new InMemoryWalletStore();

      await closureStore.addResource('organization', 'org-1');
      await closureStore.addResource('project', 'proj-1', {
        parentType: 'organization',
        parentId: 'org-1',
      });

      const orgResolver = async (_resource?: ResourceRef) => 'org-1';

      return { accessDef, closureStore, roleStore, planStore, walletStore, orgResolver };
    }

    it('can() passes when plan includes entitlement in features', async () => {
      const { accessDef, closureStore, roleStore, planStore, walletStore, orgResolver } =
        await setupWithPlans();
      await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
      await planStore.assignPlan('org-1', 'pro');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      const result = await ctx.can('organization:create-project', {
        type: 'organization',
        id: 'org-1',
      });
      expect(result).toBe(true);
    });

    it('can() denies when plan does not include entitlement in features', async () => {
      const { accessDef, closureStore, roleStore, planStore, walletStore, orgResolver } =
        await setupWithPlans();
      await roleStore.assign('user-1', 'organization', 'org-1', 'owner');
      await planStore.assignPlan('org-1', 'free');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      // project:export is only in pro.features, not free.features
      const result = await ctx.can('project:export', {
        type: 'project',
        id: 'proj-1',
      });
      expect(result).toBe(false);
    });
  });

  describe('check()', () => {
    it('returns allowed=true with empty reasons when granted', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'project', 'proj-1', 'manager');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      const result = await ctx.check('project:edit', {
        type: 'project',
        id: 'proj-1',
      });
      expect(result.allowed).toBe(true);
      expect(result.reasons).toEqual([]);
    });

    it('returns role_required when denied', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'project', 'proj-1', 'viewer');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      const result = await ctx.check('project:delete', {
        type: 'project',
        id: 'proj-1',
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('role_required');
      expect(result.meta?.requiredRoles).toEqual(['manager']);
    });

    it('returns not_authenticated for null user', async () => {
      const { accessDef, closureStore, roleStore } = await setup();

      const ctx = createAccessContext({
        userId: null,
        accessDef,
        closureStore,
        roleStore,
      });

      const result = await ctx.check('project:view', {
        type: 'project',
        id: 'proj-1',
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('not_authenticated');
    });
  });

  describe('authorize()', () => {
    it('does not throw when authorized', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'project', 'proj-1', 'manager');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      await expect(
        ctx.authorize('project:edit', { type: 'project', id: 'proj-1' }),
      ).resolves.toBeUndefined();
    });

    it('throws AuthorizationError when denied', async () => {
      const { accessDef, closureStore, roleStore } = await setup();

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      await expect(
        ctx.authorize('project:edit', { type: 'project', id: 'proj-1' }),
      ).rejects.toThrow('Not authorized');
    });
  });

  describe('canAll()', () => {
    it('returns map of entitlement+resource → boolean', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'project', 'proj-1', 'contributor');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      const results = await ctx.canAll([
        { entitlement: 'project:view', resource: { type: 'project', id: 'proj-1' } },
        { entitlement: 'project:edit', resource: { type: 'project', id: 'proj-1' } },
        { entitlement: 'project:delete', resource: { type: 'project', id: 'proj-1' } },
      ]);

      expect(results.get('project:view:proj-1')).toBe(true);
      expect(results.get('project:edit:proj-1')).toBe(true);
      expect(results.get('project:delete:proj-1')).toBe(false);
    });
  });

  describe('most permissive role wins', () => {
    it('direct assignment wins over less permissive inherited role', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'organization', 'org-1', 'member'); // inherits viewer
      await roleStore.assign('user-1', 'team', 'team-1', 'lead'); // direct lead

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      // lead → manager on project → can delete
      expect(await ctx.can('project:delete', { type: 'project', id: 'proj-1' })).toBe(true);
    });

    it('inherited role wins over less permissive direct assignment', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'organization', 'org-1', 'admin'); // inherits editor
      await roleStore.assign('user-1', 'team', 'team-1', 'viewer'); // direct viewer

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      // editor → contributor on project → can edit
      expect(await ctx.can('project:edit', { type: 'project', id: 'proj-1' })).toBe(true);
    });
  });

  describe('flag layer (Layer 1)', () => {
    it('flag disabled → can() returns false', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      const flagStore = new InMemoryFlagStore();
      flagStore.setFlag('org-1', 'export-v2', false);
      await roleStore.assign('user-1', 'project', 'proj-1', 'manager');

      const orgResolver = async () => 'org-1';

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        flagStore,
        orgResolver,
      });

      const result = await ctx.can('project:export', {
        type: 'project',
        id: 'proj-1',
      });
      expect(result).toBe(false);
    });

    it('flag enabled → can() returns true', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      const flagStore = new InMemoryFlagStore();
      flagStore.setFlag('org-1', 'export-v2', true);
      await roleStore.assign('user-1', 'project', 'proj-1', 'manager');

      const orgResolver = async () => 'org-1';

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        flagStore,
        orgResolver,
      });

      const result = await ctx.can('project:export', {
        type: 'project',
        id: 'proj-1',
      });
      expect(result).toBe(true);
    });
  });

  // ==========================================================================
  // Limit layer (Layer 4) — Phase 2
  // ==========================================================================

  describe('limit layer (Layer 4)', () => {
    function setupWithLimits() {
      const accessDef = defineAccess({
        entities: {
          organization: { roles: ['owner', 'admin', 'member'] },
          brand: {
            roles: ['owner', 'editor'],
            inherits: {
              'organization:owner': 'owner',
              'organization:admin': 'editor',
            },
          },
        },
        entitlements: {
          'organization:create-prompt': { roles: ['admin', 'owner'] },
        },
        plans: {
          free: {
            group: 'main',
            features: ['organization:create-prompt'],
            limits: {
              prompts: { max: 50, gates: 'organization:create-prompt' },
            },
          },
          enterprise: {
            group: 'main',
            features: ['organization:create-prompt'],
            limits: {
              prompts: { max: -1, gates: 'organization:create-prompt' },
            },
          },
        },
      });

      const closureStore = new InMemoryClosureStore();
      const roleStore = new InMemoryRoleAssignmentStore();
      const planStore = new InMemoryPlanStore();
      const walletStore = new InMemoryWalletStore();
      const orgResolver = async (_resource?: ResourceRef) => 'org-1';

      return { accessDef, closureStore, roleStore, planStore, walletStore, orgResolver };
    }

    it('can() returns true when within limit', async () => {
      const { accessDef, closureStore, roleStore, planStore, walletStore, orgResolver } =
        setupWithLimits();
      await closureStore.addResource('organization', 'org-1');
      await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
      await planStore.assignPlan('org-1', 'free');

      // Consume 49 of 50
      const { periodStart, periodEnd } = calculateBillingPeriod(new Date(), 'month');
      await walletStore.consume('org-1', 'prompts', periodStart, periodEnd, 50, 49);

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      const result = await ctx.can('organization:create-prompt', {
        type: 'organization',
        id: 'org-1',
      });
      expect(result).toBe(true);
    });

    it('can() returns false when limit reached', async () => {
      const { accessDef, closureStore, roleStore, planStore, walletStore, orgResolver } =
        setupWithLimits();
      await closureStore.addResource('organization', 'org-1');
      await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
      await planStore.assignPlan('org-1', 'free');

      const { periodStart, periodEnd } = calculateBillingPeriod(new Date(), 'month');
      await walletStore.consume('org-1', 'prompts', periodStart, periodEnd, 50, 50);

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      const result = await ctx.can('organization:create-prompt', {
        type: 'organization',
        id: 'org-1',
      });
      expect(result).toBe(false);
    });

    it('can() returns true when limit is unlimited (-1)', async () => {
      const { accessDef, closureStore, roleStore, planStore, walletStore, orgResolver } =
        setupWithLimits();
      await closureStore.addResource('organization', 'org-1');
      await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
      await planStore.assignPlan('org-1', 'enterprise');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      const result = await ctx.can('organization:create-prompt', {
        type: 'organization',
        id: 'org-1',
      });
      expect(result).toBe(true);
    });

    it('check() returns limit_reached with meta when limit exceeded', async () => {
      const { accessDef, closureStore, roleStore, planStore, walletStore, orgResolver } =
        setupWithLimits();
      await closureStore.addResource('organization', 'org-1');
      await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
      await planStore.assignPlan('org-1', 'free');

      const { periodStart, periodEnd } = calculateBillingPeriod(new Date(), 'month');
      await walletStore.consume('org-1', 'prompts', periodStart, periodEnd, 50, 50);

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      const result = await ctx.check('organization:create-prompt', {
        type: 'organization',
        id: 'org-1',
      });
      expect(result.allowed).toBe(false);
      expect(result.reasons).toContain('limit_reached');
      expect(result.meta?.limit?.key).toBe('prompts');
      expect(result.meta?.limit?.max).toBe(50);
      expect(result.meta?.limit?.consumed).toBe(50);
      expect(result.meta?.limit?.remaining).toBe(0);
    });
  });

  // ==========================================================================
  // Multi-limit resolution — Phase 2
  // ==========================================================================

  describe('multi-limit resolution', () => {
    function setupMultiLimit() {
      const accessDef = defineAccess({
        entities: {
          organization: { roles: ['owner', 'admin'] },
          brand: {
            roles: ['owner', 'editor'],
            inherits: {
              'organization:owner': 'owner',
              'organization:admin': 'editor',
            },
          },
        },
        entitlements: {
          'organization:create-prompt': { roles: ['admin', 'owner'] },
        },
        plans: {
          free: {
            group: 'main',
            features: ['organization:create-prompt'],
            limits: {
              prompts: { max: 50, gates: 'organization:create-prompt' },
              prompts_per_brand: {
                max: 5,
                gates: 'organization:create-prompt',
                scope: 'brand',
              },
            },
          },
        },
      });

      const closureStore = new InMemoryClosureStore();
      const roleStore = new InMemoryRoleAssignmentStore();
      const planStore = new InMemoryPlanStore();
      const walletStore = new InMemoryWalletStore();
      const orgResolver = async (_resource?: ResourceRef) => 'org-1';

      return { accessDef, closureStore, roleStore, planStore, walletStore, orgResolver };
    }

    it('denies when per-brand limit is exceeded even if tenant-level is within', async () => {
      const { accessDef, closureStore, roleStore, planStore, walletStore, orgResolver } =
        setupMultiLimit();
      await closureStore.addResource('organization', 'org-1');
      await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
      await planStore.assignPlan('org-1', 'free');

      // Tenant-level: 3 of 50 (ok), per-brand: 5 of 5 (exceeded)
      const { periodStart, periodEnd } = calculateBillingPeriod(new Date(), 'month');
      await walletStore.consume('org-1', 'prompts', periodStart, periodEnd, 50, 3);
      await walletStore.consume('org-1', 'prompts_per_brand', periodStart, periodEnd, 5, 5);

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      const result = await ctx.can('organization:create-prompt', {
        type: 'organization',
        id: 'org-1',
      });
      expect(result).toBe(false);
    });

    it('check() denial meta includes the per-brand limit as the blocker', async () => {
      const { accessDef, closureStore, roleStore, planStore, walletStore, orgResolver } =
        setupMultiLimit();
      await closureStore.addResource('organization', 'org-1');
      await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
      await planStore.assignPlan('org-1', 'free');

      const { periodStart, periodEnd } = calculateBillingPeriod(new Date(), 'month');
      await walletStore.consume('org-1', 'prompts', periodStart, periodEnd, 50, 3);
      await walletStore.consume('org-1', 'prompts_per_brand', periodStart, periodEnd, 5, 5);

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      const result = await ctx.check('organization:create-prompt', {
        type: 'organization',
        id: 'org-1',
      });
      expect(result.allowed).toBe(false);
      expect(result.meta?.limit?.key).toBe('prompts_per_brand');
    });
  });

  // ==========================================================================
  // canAndConsume with multi-limit — Phase 2
  // ==========================================================================

  describe('canAndConsume() with multi-limit', () => {
    function setupCanAndConsume() {
      const accessDef = defineAccess({
        entities: {
          organization: { roles: ['owner', 'admin'] },
        },
        entitlements: {
          'organization:create-prompt': { roles: ['admin', 'owner'] },
        },
        plans: {
          free: {
            group: 'main',
            features: ['organization:create-prompt'],
            limits: {
              prompts: { max: 5, gates: 'organization:create-prompt', per: 'month' },
            },
          },
        },
      });

      const closureStore = new InMemoryClosureStore();
      const roleStore = new InMemoryRoleAssignmentStore();
      const planStore = new InMemoryPlanStore();
      const walletStore = new InMemoryWalletStore();
      const orgResolver = async (_resource?: ResourceRef) => 'org-1';

      return { accessDef, closureStore, roleStore, planStore, walletStore, orgResolver };
    }

    it('consumes from all limits atomically', async () => {
      const { accessDef, closureStore, roleStore, planStore, walletStore, orgResolver } =
        setupCanAndConsume();
      await closureStore.addResource('organization', 'org-1');
      await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
      const startedAt = new Date();
      await planStore.assignPlan('org-1', 'free', startedAt);

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      const result = await ctx.canAndConsume('organization:create-prompt', {
        type: 'organization',
        id: 'org-1',
      });
      expect(result).toBe(true);

      // Verify consumption — use same startedAt as plan anchor
      const { periodStart, periodEnd } = calculateBillingPeriod(startedAt, 'month');
      const consumed = await walletStore.getConsumption('org-1', 'prompts', periodStart, periodEnd);
      expect(consumed).toBe(1);
    });

    it('fails when limit is exactly at max', async () => {
      const { accessDef, closureStore, roleStore, planStore, walletStore, orgResolver } =
        setupCanAndConsume();
      await closureStore.addResource('organization', 'org-1');
      await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
      const startedAt = new Date();
      await planStore.assignPlan('org-1', 'free', startedAt);

      // Pre-consume 5 (the limit)
      const { periodStart, periodEnd } = calculateBillingPeriod(startedAt, 'month');
      await walletStore.consume('org-1', 'prompts', periodStart, periodEnd, 5, 5);

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      const result = await ctx.canAndConsume('organization:create-prompt', {
        type: 'organization',
        id: 'org-1',
      });
      expect(result).toBe(false);
    });

    it('unconsume() rolls back a previous consumption', async () => {
      const { accessDef, closureStore, roleStore, planStore, walletStore, orgResolver } =
        setupCanAndConsume();
      await closureStore.addResource('organization', 'org-1');
      await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
      const startedAt = new Date();
      await planStore.assignPlan('org-1', 'free', startedAt);

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      await ctx.canAndConsume('organization:create-prompt', {
        type: 'organization',
        id: 'org-1',
      });

      const { periodStart, periodEnd } = calculateBillingPeriod(startedAt, 'month');
      expect(await walletStore.getConsumption('org-1', 'prompts', periodStart, periodEnd)).toBe(1);

      await ctx.unconsume('organization:create-prompt', {
        type: 'organization',
        id: 'org-1',
      });
      expect(await walletStore.getConsumption('org-1', 'prompts', periodStart, periodEnd)).toBe(0);
    });
  });

  // ==========================================================================
  // Add-on support — Phase 2
  // ==========================================================================

  describe('add-on support', () => {
    function setupWithAddOns() {
      const accessDef = defineAccess({
        entities: {
          organization: { roles: ['owner', 'admin'] },
        },
        entitlements: {
          'organization:create-prompt': { roles: ['admin', 'owner'] },
          'organization:export': { roles: ['admin', 'owner'] },
        },
        plans: {
          free: {
            group: 'main',
            features: ['organization:create-prompt'],
            limits: {
              prompts: { max: 50, gates: 'organization:create-prompt', per: 'month' },
            },
          },
          export_addon: {
            addOn: true,
            features: ['organization:export'],
          },
          extra_prompts_50: {
            addOn: true,
            limits: {
              prompts: { max: 50, gates: 'organization:create-prompt', per: 'month' },
            },
          },
        },
      });

      const closureStore = new InMemoryClosureStore();
      const roleStore = new InMemoryRoleAssignmentStore();
      const planStore = new InMemoryPlanStore();
      const walletStore = new InMemoryWalletStore();
      const orgResolver = async (_resource?: ResourceRef) => 'org-1';

      return { accessDef, closureStore, roleStore, planStore, walletStore, orgResolver };
    }

    it('add-on unlocks entitlement not in base plan features', async () => {
      const { accessDef, closureStore, roleStore, planStore, walletStore, orgResolver } =
        setupWithAddOns();
      await closureStore.addResource('organization', 'org-1');
      await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
      await planStore.assignPlan('org-1', 'free');
      await planStore.attachAddOn('org-1', 'export_addon');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      const result = await ctx.can('organization:export', {
        type: 'organization',
        id: 'org-1',
      });
      expect(result).toBe(true);
    });

    it('add-on limit increases effective max', async () => {
      const { accessDef, closureStore, roleStore, planStore, walletStore, orgResolver } =
        setupWithAddOns();
      await closureStore.addResource('organization', 'org-1');
      await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
      await planStore.assignPlan('org-1', 'free');
      await planStore.attachAddOn('org-1', 'extra_prompts_50');

      // Consume 75 — over base (50) but within effective (100)
      const { periodStart, periodEnd } = calculateBillingPeriod(new Date(), 'month');
      await walletStore.consume('org-1', 'prompts', periodStart, periodEnd, 100, 75);

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      const result = await ctx.can('organization:create-prompt', {
        type: 'organization',
        id: 'org-1',
      });
      expect(result).toBe(true);
    });

    it('without add-on, entitlement not in base plan is denied', async () => {
      const { accessDef, closureStore, roleStore, planStore, walletStore, orgResolver } =
        setupWithAddOns();
      await closureStore.addResource('organization', 'org-1');
      await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
      await planStore.assignPlan('org-1', 'free');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
      });

      const result = await ctx.can('organization:export', {
        type: 'organization',
        id: 'org-1',
      });
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // canBatch() — Phase 2 (replaces canAll)
  // ==========================================================================

  describe('canBatch()', () => {
    it('returns Map<string, AccessCheckResult> keyed by entity ID', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await roleStore.assign('user-1', 'project', 'proj-1', 'contributor');

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      const results = await ctx.canBatch('project:edit', [{ type: 'project', id: 'proj-1' }]);
      expect(results.get('proj-1')).toBe(true);
    });

    it('returns mixed results for different entities', async () => {
      const { accessDef, closureStore, roleStore } = await setup();
      await closureStore.addResource('project', 'proj-2', {
        parentType: 'team',
        parentId: 'team-1',
      });
      await roleStore.assign('user-1', 'project', 'proj-1', 'contributor');
      // No role on proj-2

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
      });

      const results = await ctx.canBatch('project:edit', [
        { type: 'project', id: 'proj-1' },
        { type: 'project', id: 'proj-2' },
      ]);
      expect(results.get('proj-1')).toBe(true);
      expect(results.get('proj-2')).toBe(false);
    });
  });

  // ==========================================================================
  // Versioned plan resolution — Phase 4 (grandfathered tenants)
  // ==========================================================================

  describe('versioned plan resolution (Phase 4)', () => {
    function setupWithVersionedPlans() {
      const accessDef = defineAccess({
        entities: {
          organization: { roles: ['owner', 'admin', 'member'] },
          project: {
            roles: ['manager', 'contributor', 'viewer'],
            inherits: {
              'organization:owner': 'manager',
              'organization:admin': 'contributor',
              'organization:member': 'viewer',
            },
          },
        },
        entitlements: {
          'organization:create-project': { roles: ['admin', 'owner'] },
          'project:view': { roles: ['viewer', 'contributor', 'manager'] },
          'project:export': { roles: ['manager'] },
          'project:analytics': { roles: ['manager'] },
        },
        plans: {
          pro: {
            group: 'main',
            features: [
              'organization:create-project',
              'project:view',
              'project:export',
              'project:analytics',
            ],
            limits: {
              projects: { max: 100, gates: 'organization:create-project', per: 'month' },
            },
          },
        },
      });

      const closureStore = new InMemoryClosureStore();
      const roleStore = new InMemoryRoleAssignmentStore();
      const planStore = new InMemoryPlanStore();
      const walletStore = new InMemoryWalletStore();
      const planVersionStore = new InMemoryPlanVersionStore();
      const orgResolver = async (_resource?: ResourceRef) => 'org-1';

      return {
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        planVersionStore,
        orgResolver,
      };
    }

    it('grandfathered tenant uses versioned snapshot features (not current config)', async () => {
      const {
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        planVersionStore,
        orgResolver,
      } = setupWithVersionedPlans();

      await closureStore.addResource('organization', 'org-1');
      await closureStore.addResource('project', 'proj-1', {
        parentType: 'organization',
        parentId: 'org-1',
      });
      await roleStore.assign('user-1', 'organization', 'org-1', 'owner');
      await planStore.assignPlan('org-1', 'pro');

      // Create version 1 snapshot — only has project:view and project:export, NOT project:analytics
      await planVersionStore.createVersion('pro', 'hash-v1', {
        features: ['organization:create-project', 'project:view', 'project:export'],
        limits: { projects: { max: 50, gates: 'organization:create-project', per: 'month' } },
        price: null,
      });

      // Create version 2 (current) — adds project:analytics
      await planVersionStore.createVersion('pro', 'hash-v2', {
        features: [
          'organization:create-project',
          'project:view',
          'project:export',
          'project:analytics',
        ],
        limits: { projects: { max: 100, gates: 'organization:create-project', per: 'month' } },
        price: null,
      });

      // Tenant is on v1 (grandfathered)
      await planVersionStore.setTenantVersion('org-1', 'pro', 1);

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
        planVersionStore,
      });

      // project:analytics is in current config but NOT in tenant's v1 snapshot
      const result = await ctx.can('project:analytics', {
        type: 'project',
        id: 'proj-1',
      });
      expect(result).toBe(false);

      // project:export IS in tenant's v1 snapshot
      const exportResult = await ctx.can('project:export', {
        type: 'project',
        id: 'proj-1',
      });
      expect(exportResult).toBe(true);
    });

    it('grandfathered tenant uses versioned snapshot limits (not current config)', async () => {
      const {
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        planVersionStore,
        orgResolver,
      } = setupWithVersionedPlans();

      await closureStore.addResource('organization', 'org-1');
      await roleStore.assign('user-1', 'organization', 'org-1', 'owner');
      const startedAt = new Date();
      await planStore.assignPlan('org-1', 'pro', startedAt);

      // Create version 1 snapshot — limit is 50
      await planVersionStore.createVersion('pro', 'hash-v1', {
        features: ['organization:create-project', 'project:view', 'project:export'],
        limits: { projects: { max: 50, gates: 'organization:create-project', per: 'month' } },
        price: null,
      });

      // Create version 2 (current) — limit is 100
      await planVersionStore.createVersion('pro', 'hash-v2', {
        features: [
          'organization:create-project',
          'project:view',
          'project:export',
          'project:analytics',
        ],
        limits: { projects: { max: 100, gates: 'organization:create-project', per: 'month' } },
        price: null,
      });

      // Tenant is on v1 (grandfathered) — limit should be 50 not 100
      await planVersionStore.setTenantVersion('org-1', 'pro', 1);

      // Consume 51 — over v1 limit (50) but within v2 limit (100)
      const { periodStart, periodEnd } = calculateBillingPeriod(startedAt, 'month');
      await walletStore.consume('org-1', 'projects', periodStart, periodEnd, 100, 51);

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
        planVersionStore,
      });

      // Should be denied because tenant is on v1 with max=50
      const result = await ctx.can('organization:create-project', {
        type: 'organization',
        id: 'org-1',
      });
      expect(result).toBe(false);
    });

    it('new tenant without version uses current config', async () => {
      const {
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        planVersionStore,
        orgResolver,
      } = setupWithVersionedPlans();

      await closureStore.addResource('organization', 'org-1');
      await closureStore.addResource('project', 'proj-1', {
        parentType: 'organization',
        parentId: 'org-1',
      });
      await roleStore.assign('user-1', 'organization', 'org-1', 'owner');
      await planStore.assignPlan('org-1', 'pro');

      // Version store exists but tenant has NO version set (new tenant)
      await planVersionStore.createVersion('pro', 'hash-v1', {
        features: ['organization:create-project', 'project:view'],
        limits: {},
        price: null,
      });

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
        planVersionStore,
      });

      // project:analytics is in current config — new tenant should have access
      const result = await ctx.can('project:analytics', {
        type: 'project',
        id: 'proj-1',
      });
      expect(result).toBe(true);
    });

    it('after migration, tenant uses new version features', async () => {
      const {
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        planVersionStore,
        orgResolver,
      } = setupWithVersionedPlans();

      await closureStore.addResource('organization', 'org-1');
      await closureStore.addResource('project', 'proj-1', {
        parentType: 'organization',
        parentId: 'org-1',
      });
      await roleStore.assign('user-1', 'organization', 'org-1', 'owner');
      await planStore.assignPlan('org-1', 'pro');

      // Create v1 without project:analytics
      await planVersionStore.createVersion('pro', 'hash-v1', {
        features: ['organization:create-project', 'project:view', 'project:export'],
        limits: {},
        price: null,
      });

      // Create v2 with project:analytics
      await planVersionStore.createVersion('pro', 'hash-v2', {
        features: [
          'organization:create-project',
          'project:view',
          'project:export',
          'project:analytics',
        ],
        limits: {},
        price: null,
      });

      // Simulate migration: tenant is now on v2
      await planVersionStore.setTenantVersion('org-1', 'pro', 2);

      const ctx = createAccessContext({
        userId: 'user-1',
        accessDef,
        closureStore,
        roleStore,
        planStore,
        walletStore,
        orgResolver,
        planVersionStore,
      });

      // project:analytics IS in tenant's v2 snapshot — should be allowed
      const result = await ctx.can('project:analytics', {
        type: 'project',
        id: 'proj-1',
      });
      expect(result).toBe(true);
    });
  });
});
