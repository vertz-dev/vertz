import { describe, expect, it } from 'bun:test';
import { computeAccessSet, decodeAccessSet, encodeAccessSet } from '../access-set';
import { calculateBillingPeriod } from '../billing-period';
import { InMemoryClosureStore } from '../closure-store';
import { defineAccess } from '../define-access';
import { InMemoryFlagStore } from '../flag-store';
import { InMemoryPlanStore } from '../plan-store';
import { InMemoryRoleAssignmentStore } from '../role-assignment-store';
import { InMemoryWalletStore } from '../wallet-store';

const accessDef = defineAccess({
  hierarchy: ['Organization', 'Team', 'Project'],
  roles: {
    Organization: ['owner', 'admin', 'member'],
    Team: ['lead', 'editor', 'viewer'],
    Project: ['manager', 'contributor', 'viewer'],
  },
  inheritance: {
    Organization: { owner: 'lead', admin: 'editor', member: 'viewer' },
    Team: { lead: 'manager', editor: 'contributor', viewer: 'viewer' },
  },
  entitlements: {
    'project:create': { roles: ['admin', 'owner'] },
    'project:view': { roles: ['viewer', 'contributor', 'manager'] },
    'project:edit': { roles: ['contributor', 'manager'] },
    'project:delete': { roles: ['manager'] },
    'app:use': { roles: [] },
  },
});

function createStores() {
  const roleStore = new InMemoryRoleAssignmentStore();
  const closureStore = new InMemoryClosureStore();
  return { roleStore, closureStore };
}

describe('computeAccessSet', () => {
  it('returns allowed for user with admin role on an org', async () => {
    const { roleStore, closureStore } = createStores();
    await closureStore.addResource('Organization', 'org-1');
    await roleStore.assign('user-1', 'Organization', 'org-1', 'admin');

    const result = await computeAccessSet({
      userId: 'user-1',
      accessDef,
      roleStore,
      closureStore,
    });

    expect(result.entitlements['project:create'].allowed).toBe(true);
  });

  it('returns denied for unauthenticated user (null userId)', async () => {
    const { roleStore, closureStore } = createStores();

    const result = await computeAccessSet({
      userId: null,
      accessDef,
      roleStore,
      closureStore,
    });

    for (const [, check] of Object.entries(result.entitlements)) {
      expect(check.allowed).toBe(false);
      expect(check.reasons).toContain('not_authenticated');
    }
  });

  it('resolves inherited roles (owner on Org -> contributor on Project)', async () => {
    const { roleStore, closureStore } = createStores();
    await closureStore.addResource('Organization', 'org-1');
    await closureStore.addResource('Team', 'team-1', {
      parentType: 'Organization',
      parentId: 'org-1',
    });
    await closureStore.addResource('Project', 'proj-1', {
      parentType: 'Team',
      parentId: 'team-1',
    });
    await roleStore.assign('user-1', 'Organization', 'org-1', 'owner');

    const result = await computeAccessSet({
      userId: 'user-1',
      accessDef,
      roleStore,
      closureStore,
    });

    // owner -> lead -> manager, so project:delete (requires manager) should be allowed
    expect(result.entitlements['project:delete'].allowed).toBe(true);
    expect(result.entitlements['project:view'].allowed).toBe(true);
    expect(result.entitlements['project:create'].allowed).toBe(true);
  });

  it('handles user with partial entitlements (some allowed, some denied)', async () => {
    const { roleStore, closureStore } = createStores();
    await closureStore.addResource('Organization', 'org-1');
    await closureStore.addResource('Team', 'team-1', {
      parentType: 'Organization',
      parentId: 'org-1',
    });
    await closureStore.addResource('Project', 'proj-1', {
      parentType: 'Team',
      parentId: 'team-1',
    });
    // member -> viewer (Team) -> viewer (Project)
    await roleStore.assign('user-1', 'Organization', 'org-1', 'member');

    const result = await computeAccessSet({
      userId: 'user-1',
      accessDef,
      roleStore,
      closureStore,
    });

    expect(result.entitlements['project:view'].allowed).toBe(true);
    expect(result.entitlements['project:edit'].allowed).toBe(false);
    expect(result.entitlements['project:delete'].allowed).toBe(false);
    expect(result.entitlements['project:create'].allowed).toBe(false);
  });

  it('grants entitlements with empty roles array automatically', async () => {
    const { roleStore, closureStore } = createStores();

    const result = await computeAccessSet({
      userId: 'user-1',
      accessDef,
      roleStore,
      closureStore,
    });

    expect(result.entitlements['app:use'].allowed).toBe(true);
    expect(result.entitlements['app:use'].reasons).toEqual([]);
  });

  it('stubs flags as empty and uses config.plan', async () => {
    const { roleStore, closureStore } = createStores();

    const result = await computeAccessSet({
      userId: 'user-1',
      accessDef,
      roleStore,
      closureStore,
      plan: 'pro',
    });

    expect(result.flags).toEqual({});
    expect(result.plan).toBe('pro');
    expect(result.computedAt).toBeTruthy();
  });

  it('handles user with no role assignments', async () => {
    const { roleStore, closureStore } = createStores();

    const result = await computeAccessSet({
      userId: 'user-1',
      accessDef,
      roleStore,
      closureStore,
    });

    // All role-requiring entitlements denied, app:use granted
    expect(result.entitlements['project:create'].allowed).toBe(false);
    expect(result.entitlements['project:view'].allowed).toBe(false);
    expect(result.entitlements['app:use'].allowed).toBe(true);
  });
});

describe('encodeAccessSet', () => {
  it('produces sparse encoding (only allowed + non-empty meta)', () => {
    const set = {
      entitlements: {
        'project:view': { allowed: true, reasons: [] as string[] },
        'project:edit': { allowed: false, reasons: ['role_required'] as string[] },
        'project:delete': {
          allowed: false,
          reasons: ['role_required'] as string[],
          reason: 'role_required' as const,
          meta: { requiredRoles: ['manager'] },
        },
      },
      flags: {},
      plan: null,
      computedAt: '2026-01-01T00:00:00.000Z',
    };

    const encoded = encodeAccessSet(set);

    // Allowed entries should be present
    expect(encoded.entitlements['project:view']).toBeDefined();
    // Denied without meta should NOT be present (sparse)
    expect(encoded.entitlements['project:edit']).toBeUndefined();
    // Denied WITH meta should be present
    expect(encoded.entitlements['project:delete']).toBeDefined();
  });

  it('preserves meta.limit in encoded output (not stripped)', () => {
    const set = {
      entitlements: {
        'project:create': {
          allowed: true,
          reasons: [] as string[],
          meta: { limit: { max: 5, consumed: 3, remaining: 2 } },
        },
      },
      flags: {},
      plan: 'free',
      computedAt: '2026-01-01T00:00:00.000Z',
    };

    const encoded = encodeAccessSet(set);
    const entry = encoded.entitlements['project:create'];

    expect(entry).toBeDefined();
    expect(entry?.meta?.limit).toEqual({ max: 5, consumed: 3, remaining: 2 });
  });

  it('strips requiredRoles and requiredPlans from encoded output', () => {
    const set = {
      entitlements: {
        'project:delete': {
          allowed: false,
          reasons: ['role_required'] as string[],
          reason: 'role_required' as const,
          meta: { requiredRoles: ['manager'], requiredPlans: ['pro'] },
        },
      },
      flags: {},
      plan: 'free',
      computedAt: '2026-01-01T00:00:00.000Z',
    };

    const encoded = encodeAccessSet(set);
    const entry = encoded.entitlements['project:delete'];

    expect(entry).toBeDefined();
    expect(entry?.meta?.requiredRoles).toBeUndefined();
    expect(entry?.meta?.requiredPlans).toBeUndefined();
  });
});

describe('decodeAccessSet', () => {
  it('inflates sparse encoding to full AccessSet', () => {
    const encoded = {
      entitlements: {
        'project:view': { allowed: true, reasons: [] },
      },
      flags: {},
      plan: null,
      computedAt: '2026-01-01T00:00:00.000Z',
    };

    const decoded = decodeAccessSet(encoded, accessDef);

    expect(decoded.entitlements['project:view'].allowed).toBe(true);
    // Missing entitlements filled in as denied
    expect(decoded.entitlements['project:create'].allowed).toBe(false);
    expect(decoded.entitlements['project:create'].reasons).toContain('role_required');
  });

  it('defaults missing entitlements to denied', () => {
    const encoded = {
      entitlements: {},
      flags: {},
      plan: null,
      computedAt: '2026-01-01T00:00:00.000Z',
    };

    const decoded = decodeAccessSet(encoded, accessDef);

    for (const name of Object.keys(accessDef.entitlements)) {
      const check = decoded.entitlements[name];
      expect(check).toBeDefined();
      if (accessDef.entitlements[name].roles.length === 0) {
        // No-role entitlement defaults to denied in sparse encoding
        // (it was allowed but missing from encoded = treated as denied)
        expect(check.allowed).toBe(false);
      } else {
        expect(check.allowed).toBe(false);
        expect(check.reasons).toContain('role_required');
      }
    }
  });
});

describe('decodeAccessSet — limit data', () => {
  it('restores meta.limit from encoded data', () => {
    const encoded = {
      entitlements: {
        'project:create': {
          allowed: true,
          meta: { limit: { max: 5, consumed: 3, remaining: 2 } },
        },
      },
      flags: {},
      plan: 'free',
      computedAt: '2026-01-01T00:00:00.000Z',
    };

    const decoded = decodeAccessSet(encoded, accessDef);

    expect(decoded.entitlements['project:create'].allowed).toBe(true);
    expect(decoded.entitlements['project:create'].meta?.limit).toEqual({
      max: 5,
      consumed: 3,
      remaining: 2,
    });
  });
});

describe('computeAccessSet — plan/wallet enrichment', () => {
  const planAccessDef = defineAccess({
    hierarchy: ['Organization', 'Team', 'Project'],
    roles: {
      Organization: ['owner', 'admin', 'member'],
      Team: ['lead', 'editor', 'viewer'],
      Project: ['manager', 'contributor', 'viewer'],
    },
    inheritance: {
      Organization: { owner: 'lead', admin: 'editor', member: 'viewer' },
      Team: { lead: 'manager', editor: 'contributor', viewer: 'viewer' },
    },
    entitlements: {
      'project:create': { roles: ['admin', 'owner'], plans: ['pro'] },
      'project:view': { roles: ['viewer', 'contributor', 'manager'] },
      'project:edit': { roles: ['contributor', 'manager'] },
      'project:delete': { roles: ['manager'] },
      'app:use': { roles: [] },
    },
    plans: {
      free: {
        entitlements: ['project:view', 'project:edit', 'app:use'],
      },
      pro: {
        entitlements: [
          'project:create',
          'project:view',
          'project:edit',
          'project:delete',
          'app:use',
        ],
        limits: {
          'project:create': { per: 'month', max: 10 },
        },
      },
    },
  });

  it('includes limit info when planStore and walletStore are provided', async () => {
    const { roleStore, closureStore } = createStores();
    const planStore = new InMemoryPlanStore();
    const walletStore = new InMemoryWalletStore();

    await closureStore.addResource('Organization', 'org-1');
    await roleStore.assign('user-1', 'Organization', 'org-1', 'admin');
    const planStartedAt = new Date('2026-01-01T00:00:00Z');
    await planStore.assignPlan('org-1', 'pro', planStartedAt);

    // Consume 3 of 10 — use the same billing period calculation as computeAccessSet
    const { periodStart, periodEnd } = calculateBillingPeriod(planStartedAt, 'month');
    await walletStore.consume('org-1', 'project:create', periodStart, periodEnd, 10, 3);

    const result = await computeAccessSet({
      userId: 'user-1',
      accessDef: planAccessDef,
      roleStore,
      closureStore,
      planStore,
      walletStore,
      orgId: 'org-1',
    });

    // project:create should be allowed (admin has role, pro plan includes it, 3/10 consumed)
    expect(result.entitlements['project:create'].allowed).toBe(true);
    expect(result.entitlements['project:create'].meta?.limit).toBeDefined();
    expect(result.entitlements['project:create'].meta?.limit?.max).toBe(10);
    expect(result.entitlements['project:create'].meta?.limit?.consumed).toBe(3);
    expect(result.entitlements['project:create'].meta?.limit?.remaining).toBe(7);
  });

  it('denies when plan does not include entitlement', async () => {
    const { roleStore, closureStore } = createStores();
    const planStore = new InMemoryPlanStore();
    const walletStore = new InMemoryWalletStore();

    await closureStore.addResource('Organization', 'org-1');
    await roleStore.assign('user-1', 'Organization', 'org-1', 'admin');
    await planStore.assignPlan('org-1', 'free'); // free plan does NOT include project:create

    const result = await computeAccessSet({
      userId: 'user-1',
      accessDef: planAccessDef,
      roleStore,
      closureStore,
      planStore,
      walletStore,
      orgId: 'org-1',
    });

    // project:create requires plans: ['pro'], but org is on free plan
    expect(result.entitlements['project:create'].allowed).toBe(false);
    expect(result.entitlements['project:create'].reasons).toContain('plan_required');
  });

  it('denies when limit is reached', async () => {
    const { roleStore, closureStore } = createStores();
    const planStore = new InMemoryPlanStore();
    const walletStore = new InMemoryWalletStore();

    await closureStore.addResource('Organization', 'org-1');
    await roleStore.assign('user-1', 'Organization', 'org-1', 'admin');
    const planStartedAt = new Date('2026-01-01T00:00:00Z');
    await planStore.assignPlan('org-1', 'pro', planStartedAt);

    // Consume all 10 — use the same billing period calculation as computeAccessSet
    const { periodStart, periodEnd } = calculateBillingPeriod(planStartedAt, 'month');
    await walletStore.consume('org-1', 'project:create', periodStart, periodEnd, 10, 10);

    const result = await computeAccessSet({
      userId: 'user-1',
      accessDef: planAccessDef,
      roleStore,
      closureStore,
      planStore,
      walletStore,
      orgId: 'org-1',
    });

    expect(result.entitlements['project:create'].allowed).toBe(false);
    expect(result.entitlements['project:create'].reasons).toContain('limit_reached');
    expect(result.entitlements['project:create'].meta?.limit?.remaining).toBe(0);
  });
});

describe('encode/decode round-trip', () => {
  it('preserves all data through round-trip', async () => {
    const { roleStore, closureStore } = createStores();
    await closureStore.addResource('Organization', 'org-1');
    await closureStore.addResource('Team', 'team-1', {
      parentType: 'Organization',
      parentId: 'org-1',
    });
    await closureStore.addResource('Project', 'proj-1', {
      parentType: 'Team',
      parentId: 'team-1',
    });
    await roleStore.assign('user-1', 'Organization', 'org-1', 'admin');

    const original = await computeAccessSet({
      userId: 'user-1',
      accessDef,
      roleStore,
      closureStore,
      plan: 'pro',
    });

    const encoded = encodeAccessSet(original);
    const decoded = decodeAccessSet(encoded, accessDef);

    // Allowed/denied status preserved
    for (const name of Object.keys(accessDef.entitlements)) {
      expect(decoded.entitlements[name].allowed).toBe(original.entitlements[name].allowed);
    }

    // Metadata preserved
    expect(decoded.plan).toBe(original.plan);
    expect(decoded.computedAt).toBe(original.computedAt);
    expect(decoded.flags).toEqual(original.flags);
  });

  it('includes real flags from flagStore', async () => {
    const flagAccessDef = defineAccess({
      hierarchy: ['Organization', 'Project'],
      roles: {
        Organization: ['admin'],
        Project: ['manager'],
      },
      inheritance: {
        Organization: { admin: 'manager' },
      },
      entitlements: {
        'project:view': { roles: ['manager'] },
        'project:export': { roles: ['manager'], flags: ['export-v2'] },
      },
    });

    const roleStore = new InMemoryRoleAssignmentStore();
    const closureStore = new InMemoryClosureStore();
    const flagStore = new InMemoryFlagStore();

    await closureStore.addResource('Organization', 'org-1');
    await closureStore.addResource('Project', 'proj-1', {
      parentType: 'Organization',
      parentId: 'org-1',
    });
    await roleStore.assign('user-1', 'Organization', 'org-1', 'admin');

    flagStore.setFlag('org-1', 'export-v2', true);
    flagStore.setFlag('org-1', 'some-other-flag', false);

    const result = await computeAccessSet({
      userId: 'user-1',
      accessDef: flagAccessDef,
      roleStore,
      closureStore,
      flagStore,
      orgId: 'org-1',
    });

    expect(result.flags).toEqual({
      'export-v2': true,
      'some-other-flag': false,
    });
  });

  it('marks entitlement denied with flag_disabled when flag is off', async () => {
    const flagAccessDef = defineAccess({
      hierarchy: ['Organization', 'Project'],
      roles: {
        Organization: ['admin'],
        Project: ['manager'],
      },
      inheritance: {
        Organization: { admin: 'manager' },
      },
      entitlements: {
        'project:view': { roles: ['manager'] },
        'project:export': { roles: ['manager'], flags: ['export-v2'] },
      },
    });

    const roleStore = new InMemoryRoleAssignmentStore();
    const closureStore = new InMemoryClosureStore();
    const flagStore = new InMemoryFlagStore();

    await closureStore.addResource('Organization', 'org-1');
    await closureStore.addResource('Project', 'proj-1', {
      parentType: 'Organization',
      parentId: 'org-1',
    });
    await roleStore.assign('user-1', 'Organization', 'org-1', 'admin');

    flagStore.setFlag('org-1', 'export-v2', false);

    const result = await computeAccessSet({
      userId: 'user-1',
      accessDef: flagAccessDef,
      roleStore,
      closureStore,
      flagStore,
      orgId: 'org-1',
    });

    // project:export should be denied because flag is off
    expect(result.entitlements['project:export'].allowed).toBe(false);
    expect(result.entitlements['project:export'].reasons).toContain('flag_disabled');
    expect(result.entitlements['project:export'].meta?.disabledFlags).toEqual(['export-v2']);

    // project:view has no flags, should still be allowed
    expect(result.entitlements['project:view'].allowed).toBe(true);
  });
});
