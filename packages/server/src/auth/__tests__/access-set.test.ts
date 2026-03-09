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
  },
  entitlements: {
    'organization:create-project': { roles: ['admin', 'owner'] },
    'project:view': { roles: ['viewer', 'contributor', 'manager'] },
    'project:edit': { roles: ['contributor', 'manager'] },
    'project:delete': { roles: ['manager'] },
    'organization:use': { roles: [] },
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
    await closureStore.addResource('organization', 'org-1');
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');

    const result = await computeAccessSet({
      userId: 'user-1',
      accessDef,
      roleStore,
      closureStore,
    });

    expect(result.entitlements['organization:create-project'].allowed).toBe(true);
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

  it('resolves inherited roles (owner on org -> manager on project)', async () => {
    const { roleStore, closureStore } = createStores();
    await closureStore.addResource('organization', 'org-1');
    await closureStore.addResource('team', 'team-1', {
      parentType: 'organization',
      parentId: 'org-1',
    });
    await closureStore.addResource('project', 'proj-1', {
      parentType: 'team',
      parentId: 'team-1',
    });
    await roleStore.assign('user-1', 'organization', 'org-1', 'owner');

    const result = await computeAccessSet({
      userId: 'user-1',
      accessDef,
      roleStore,
      closureStore,
    });

    // owner -> lead -> manager, so project:delete (requires manager) should be allowed
    expect(result.entitlements['project:delete'].allowed).toBe(true);
    expect(result.entitlements['project:view'].allowed).toBe(true);
    expect(result.entitlements['organization:create-project'].allowed).toBe(true);
  });

  it('handles user with partial entitlements (some allowed, some denied)', async () => {
    const { roleStore, closureStore } = createStores();
    await closureStore.addResource('organization', 'org-1');
    await closureStore.addResource('team', 'team-1', {
      parentType: 'organization',
      parentId: 'org-1',
    });
    await closureStore.addResource('project', 'proj-1', {
      parentType: 'team',
      parentId: 'team-1',
    });
    // member -> viewer (team) -> viewer (project)
    await roleStore.assign('user-1', 'organization', 'org-1', 'member');

    const result = await computeAccessSet({
      userId: 'user-1',
      accessDef,
      roleStore,
      closureStore,
    });

    expect(result.entitlements['project:view'].allowed).toBe(true);
    expect(result.entitlements['project:edit'].allowed).toBe(false);
    expect(result.entitlements['project:delete'].allowed).toBe(false);
    expect(result.entitlements['organization:create-project'].allowed).toBe(false);
  });

  it('grants entitlements with empty roles array automatically', async () => {
    const { roleStore, closureStore } = createStores();

    const result = await computeAccessSet({
      userId: 'user-1',
      accessDef,
      roleStore,
      closureStore,
    });

    expect(result.entitlements['organization:use'].allowed).toBe(true);
    expect(result.entitlements['organization:use'].reasons).toEqual([]);
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

    // All role-requiring entitlements denied, organization:use granted
    expect(result.entitlements['organization:create-project'].allowed).toBe(false);
    expect(result.entitlements['project:view'].allowed).toBe(false);
    expect(result.entitlements['organization:use'].allowed).toBe(true);
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

    expect(encoded.entitlements['project:view']).toBeDefined();
    expect(encoded.entitlements['project:edit']).toBeUndefined();
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
    expect(decoded.entitlements['organization:create-project'].allowed).toBe(false);
    expect(decoded.entitlements['organization:create-project'].reasons).toContain('role_required');
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
        'organization:create-project': {
          allowed: true,
          meta: { limit: { max: 5, consumed: 3, remaining: 2 } },
        },
      },
      flags: {},
      plan: 'free',
      computedAt: '2026-01-01T00:00:00.000Z',
    };

    const decoded = decodeAccessSet(encoded, accessDef);

    expect(decoded.entitlements['organization:create-project'].allowed).toBe(true);
    expect(decoded.entitlements['organization:create-project'].meta?.limit).toEqual({
      max: 5,
      consumed: 3,
      remaining: 2,
    });
  });
});

describe('computeAccessSet — plan/wallet enrichment', () => {
  const planAccessDef = defineAccess({
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
    },
    entitlements: {
      'organization:create-project': { roles: ['admin', 'owner'] },
      'project:view': { roles: ['viewer', 'contributor', 'manager'] },
      'project:edit': { roles: ['contributor', 'manager'] },
      'project:delete': { roles: ['manager'] },
      'organization:use': { roles: [] },
    },
    plans: {
      free: {
        group: 'main',
        features: ['project:view', 'project:edit', 'organization:use'],
      },
      pro: {
        group: 'main',
        features: [
          'organization:create-project',
          'project:view',
          'project:edit',
          'project:delete',
          'organization:use',
        ],
        limits: {
          projects: { max: 10, gates: 'organization:create-project', per: 'month' },
        },
      },
    },
  });

  it('includes limit info when planStore and walletStore are provided', async () => {
    const { roleStore, closureStore } = createStores();
    const planStore = new InMemoryPlanStore();
    const walletStore = new InMemoryWalletStore();

    await closureStore.addResource('organization', 'org-1');
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
    const planStartedAt = new Date('2026-01-01T00:00:00Z');
    await planStore.assignPlan('org-1', 'pro', planStartedAt);

    const { periodStart, periodEnd } = calculateBillingPeriod(planStartedAt, 'month');
    await walletStore.consume('org-1', 'projects', periodStart, periodEnd, 10, 3);

    const result = await computeAccessSet({
      userId: 'user-1',
      accessDef: planAccessDef,
      roleStore,
      closureStore,
      planStore,
      walletStore,
      orgId: 'org-1',
    });

    expect(result.entitlements['organization:create-project'].allowed).toBe(true);
    expect(result.entitlements['organization:create-project'].meta?.limit).toBeDefined();
    expect(result.entitlements['organization:create-project'].meta?.limit?.max).toBe(10);
    expect(result.entitlements['organization:create-project'].meta?.limit?.consumed).toBe(3);
    expect(result.entitlements['organization:create-project'].meta?.limit?.remaining).toBe(7);
  });

  it('allows role-based entitlements even when plan store is present', async () => {
    const { roleStore, closureStore } = createStores();
    const planStore = new InMemoryPlanStore();
    const walletStore = new InMemoryWalletStore();

    await closureStore.addResource('organization', 'org-1');
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
    await planStore.assignPlan('org-1', 'free');

    const result = await computeAccessSet({
      userId: 'user-1',
      accessDef: planAccessDef,
      roleStore,
      closureStore,
      planStore,
      walletStore,
      orgId: 'org-1',
    });

    // organization:create-project is plan-gated (in pro's features, not free's)
    // Even though admin has the role, the plan layer denies it on the free plan.
    expect(result.entitlements['organization:create-project'].allowed).toBe(false);
    expect(result.entitlements['organization:create-project'].reasons).toContain('plan_required');
    // organization:use is in free's features and has no role requirement
    expect(result.entitlements['organization:use'].allowed).toBe(true);
  });

  it('denies when limit is reached', async () => {
    const { roleStore, closureStore } = createStores();
    const planStore = new InMemoryPlanStore();
    const walletStore = new InMemoryWalletStore();

    await closureStore.addResource('organization', 'org-1');
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');
    const planStartedAt = new Date('2026-01-01T00:00:00Z');
    await planStore.assignPlan('org-1', 'pro', planStartedAt);

    const { periodStart, periodEnd } = calculateBillingPeriod(planStartedAt, 'month');
    await walletStore.consume('org-1', 'projects', periodStart, periodEnd, 10, 10);

    const result = await computeAccessSet({
      userId: 'user-1',
      accessDef: planAccessDef,
      roleStore,
      closureStore,
      planStore,
      walletStore,
      orgId: 'org-1',
    });

    expect(result.entitlements['organization:create-project'].allowed).toBe(false);
    expect(result.entitlements['organization:create-project'].reasons).toContain('limit_reached');
    expect(result.entitlements['organization:create-project'].meta?.limit?.remaining).toBe(0);
  });
});

describe('encode/decode round-trip', () => {
  it('preserves all data through round-trip', async () => {
    const { roleStore, closureStore } = createStores();
    await closureStore.addResource('organization', 'org-1');
    await closureStore.addResource('team', 'team-1', {
      parentType: 'organization',
      parentId: 'org-1',
    });
    await closureStore.addResource('project', 'proj-1', {
      parentType: 'team',
      parentId: 'team-1',
    });
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');

    const original = await computeAccessSet({
      userId: 'user-1',
      accessDef,
      roleStore,
      closureStore,
      plan: 'pro',
    });

    const encoded = encodeAccessSet(original);
    const decoded = decodeAccessSet(encoded, accessDef);

    for (const name of Object.keys(accessDef.entitlements)) {
      expect(decoded.entitlements[name].allowed).toBe(original.entitlements[name].allowed);
    }

    expect(decoded.plan).toBe(original.plan);
    expect(decoded.computedAt).toBe(original.computedAt);
    expect(decoded.flags).toEqual(original.flags);
  });

  it('includes real flags from flagStore', async () => {
    const flagAccessDef = defineAccess({
      entities: {
        organization: { roles: ['admin'] },
        project: {
          roles: ['manager'],
          inherits: { 'organization:admin': 'manager' },
        },
      },
      entitlements: {
        'project:view': { roles: ['manager'] },
        'project:export': { roles: ['manager'], flags: ['export-v2'] },
      },
    });

    const roleStore = new InMemoryRoleAssignmentStore();
    const closureStore = new InMemoryClosureStore();
    const flagStore = new InMemoryFlagStore();

    await closureStore.addResource('organization', 'org-1');
    await closureStore.addResource('project', 'proj-1', {
      parentType: 'organization',
      parentId: 'org-1',
    });
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');

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
      entities: {
        organization: { roles: ['admin'] },
        project: {
          roles: ['manager'],
          inherits: { 'organization:admin': 'manager' },
        },
      },
      entitlements: {
        'project:view': { roles: ['manager'] },
        'project:export': { roles: ['manager'], flags: ['export-v2'] },
      },
    });

    const roleStore = new InMemoryRoleAssignmentStore();
    const closureStore = new InMemoryClosureStore();
    const flagStore = new InMemoryFlagStore();

    await closureStore.addResource('organization', 'org-1');
    await closureStore.addResource('project', 'proj-1', {
      parentType: 'organization',
      parentId: 'org-1',
    });
    await roleStore.assign('user-1', 'organization', 'org-1', 'admin');

    flagStore.setFlag('org-1', 'export-v2', false);

    const result = await computeAccessSet({
      userId: 'user-1',
      accessDef: flagAccessDef,
      roleStore,
      closureStore,
      flagStore,
      orgId: 'org-1',
    });

    expect(result.entitlements['project:export'].allowed).toBe(false);
    expect(result.entitlements['project:export'].reasons).toContain('flag_disabled');
    expect(result.entitlements['project:export'].meta?.disabledFlags).toEqual(['export-v2']);
    expect(result.entitlements['project:view'].allowed).toBe(true);
  });
});

describe('JWT access set with plan features', () => {
  const planAccessDef = defineAccess({
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
      'project:view': { roles: ['viewer', 'contributor', 'manager'] },
      'project:edit': { roles: ['contributor', 'manager'] },
      'project:export': { roles: ['manager'], flags: ['export-v2'] },
      'project:delete': { roles: ['manager'] },
    },
    plans: {
      free: {
        group: 'main',
        features: ['project:view', 'project:edit'],
      },
      pro: {
        group: 'main',
        features: ['project:view', 'project:edit', 'project:delete', 'project:export'],
      },
    },
  });

  it('encoded access set contains plan-gated entitlements with plan_required reason', async () => {
    const roleStore = new InMemoryRoleAssignmentStore();
    const closureStore = new InMemoryClosureStore();
    const planStore = new InMemoryPlanStore();

    await closureStore.addResource('organization', 'org-1');
    await closureStore.addResource('project', 'proj-1', {
      parentType: 'organization',
      parentId: 'org-1',
    });
    await roleStore.assign('user-1', 'organization', 'org-1', 'owner');
    await planStore.assignPlan('org-1', 'free');

    const accessSet = await computeAccessSet({
      userId: 'user-1',
      accessDef: planAccessDef,
      roleStore,
      closureStore,
      planStore,
      orgId: 'org-1',
    });

    const encoded = encodeAccessSet(accessSet);

    // project:view and project:edit are in free plan features — allowed
    expect(encoded.entitlements['project:view']?.allowed).toBe(true);
    expect(encoded.entitlements['project:edit']?.allowed).toBe(true);

    // project:delete is NOT in free plan features — denied with plan_required
    expect(encoded.entitlements['project:delete']?.allowed).toBe(false);
    expect(encoded.entitlements['project:delete']?.reasons).toContain('plan_required');
  });

  it('decode restores plan feature entitlements from JWT', async () => {
    const roleStore = new InMemoryRoleAssignmentStore();
    const closureStore = new InMemoryClosureStore();
    const planStore = new InMemoryPlanStore();

    await closureStore.addResource('organization', 'org-1');
    await closureStore.addResource('project', 'proj-1', {
      parentType: 'organization',
      parentId: 'org-1',
    });
    await roleStore.assign('user-1', 'organization', 'org-1', 'owner');
    await planStore.assignPlan('org-1', 'pro');

    const accessSet = await computeAccessSet({
      userId: 'user-1',
      accessDef: planAccessDef,
      roleStore,
      closureStore,
      planStore,
      orgId: 'org-1',
    });

    const encoded = encodeAccessSet(accessSet);
    const json = JSON.stringify(encoded);
    const parsed = JSON.parse(json);
    const decoded = decodeAccessSet(parsed, planAccessDef);

    // All pro features should be allowed
    expect(decoded.entitlements['project:view'].allowed).toBe(true);
    expect(decoded.entitlements['project:edit'].allowed).toBe(true);
    expect(decoded.entitlements['project:delete'].allowed).toBe(true);
    expect(decoded.plan).toBe('pro');
  });

  it('plan change updates access set hash (detected via encoded set difference)', async () => {
    const roleStore = new InMemoryRoleAssignmentStore();
    const closureStore = new InMemoryClosureStore();
    const planStore = new InMemoryPlanStore();

    await closureStore.addResource('organization', 'org-1');
    await closureStore.addResource('project', 'proj-1', {
      parentType: 'organization',
      parentId: 'org-1',
    });
    await roleStore.assign('user-1', 'organization', 'org-1', 'owner');
    await planStore.assignPlan('org-1', 'free');

    // Compute with free plan
    const freeSet = await computeAccessSet({
      userId: 'user-1',
      accessDef: planAccessDef,
      roleStore,
      closureStore,
      planStore,
      orgId: 'org-1',
    });
    const freeEncoded = encodeAccessSet(freeSet);

    // Change to pro plan
    await planStore.assignPlan('org-1', 'pro');

    // Compute with pro plan
    const proSet = await computeAccessSet({
      userId: 'user-1',
      accessDef: planAccessDef,
      roleStore,
      closureStore,
      planStore,
      orgId: 'org-1',
    });
    const proEncoded = encodeAccessSet(proSet);

    // Encoded sets should differ — different plan = different access
    expect(JSON.stringify(freeEncoded)).not.toBe(JSON.stringify(proEncoded));
    expect(freeEncoded.plan).toBe('free');
    expect(proEncoded.plan).toBe('pro');
  });
});
