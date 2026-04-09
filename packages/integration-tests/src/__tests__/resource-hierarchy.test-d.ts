/**
 * Type flow verification — Resource Hierarchy [#1072]
 *
 * Verifies type flows:
 * - defineAccess() returns AccessDefinition with correct structure
 * - AccessCheckResult has the right shape
 * - DenialReason is a constrained union type
 * - rules.* builders return correct types
 * - createAccessContext returns AccessContext with can/check/authorize/canAll
 * - EntityDef, DefineAccessInput, EntitlementValue types
 */
import { describe, it } from '@vertz/test';
import type {
  AccessCheckResult,
  AccessContext,
  AccessDefinition,
  ClosureStore,
  DefineAccessInput,
  DenialMeta,
  DenialReason,
  EntitlementDef,
  EntitlementValue,
  EntityDef,
  RoleAssignmentStore,
  RuleContext,
} from '@vertz/server';
import {
  createAccessContext,
  defineAccess,
  InMemoryClosureStore,
  InMemoryRoleAssignmentStore,
  rules,
} from '@vertz/server';

describe('Type flow: defineAccess → AccessDefinition', () => {
  it('defineAccess returns AccessDefinition', () => {
    const config = defineAccess({
      entities: {
        organization: { roles: ['admin'] },
      },
      entitlements: { 'organization:manage': { roles: ['admin'] } },
    });
    // Positive: config is AccessDefinition
    const _def: AccessDefinition = config;
    void _def;
  });

  it('AccessDefinition.hierarchy is readonly string[]', () => {
    const config = defineAccess({
      entities: {
        organization: { roles: ['admin'] },
      },
      entitlements: {},
    });
    // @ts-expect-error — hierarchy is readonly, push not allowed
    config.hierarchy.push('team');
  });

  it('AccessDefinition is frozen (no property assignment)', () => {
    const config = defineAccess({
      entities: {
        organization: { roles: ['admin'] },
      },
      entitlements: {},
    });
    // @ts-expect-error — config is frozen, cannot assign
    config.hierarchy = [];
  });

  it('DefineAccessInput requires entities, not hierarchy', () => {
    // @ts-expect-error — entities is required
    const _bad: DefineAccessInput = { entitlements: {} };
    void _bad;
  });

  it('EntityDef requires roles', () => {
    // @ts-expect-error — roles is required
    const _bad: EntityDef = {};
    void _bad;
  });

  it('EntityDef.roles must be string array', () => {
    // @ts-expect-error — roles must be string[], not number[]
    const _bad: EntityDef = { roles: [123] };
    void _bad;
  });
});

describe('Type flow: AccessCheckResult shape', () => {
  it('AccessCheckResult has allowed, reasons, reason, meta', () => {
    const result: AccessCheckResult = {
      allowed: true,
      reasons: [],
      reason: undefined,
      meta: undefined,
    };
    // Positive: all required fields present
    const _allowed: boolean = result.allowed;
    const _reasons: DenialReason[] = result.reasons;
    void _allowed;
    void _reasons;
  });

  it('DenialReason only accepts valid values', () => {
    const _valid: DenialReason = 'role_required';
    void _valid;
    // @ts-expect-error — 'invalid_reason' is not a valid DenialReason
    const _invalid: DenialReason = 'invalid_reason';
    void _invalid;
  });

  it('DenialMeta has optional fields', () => {
    const meta: DenialMeta = {};
    const _full: DenialMeta = {
      requiredPlans: ['pro'],
      requiredRoles: ['admin'],
      limit: { max: 10, consumed: 5, remaining: 5 },
      fvaMaxAge: 600,
    };
    void meta;
    void _full;
  });
});

describe('Type flow: EntitlementDef shape', () => {
  it('EntitlementDef requires roles, optional plans and flags', () => {
    const _basic: EntitlementDef = { roles: ['admin'] };
    const _full: EntitlementDef = {
      roles: ['admin'],
      plans: ['enterprise'],
      flags: ['export-v2'],
    };
    void _basic;
    void _full;
  });

  it('EntitlementDef rejects missing roles', () => {
    // @ts-expect-error — roles is required
    const _bad: EntitlementDef = { plans: ['pro'] };
    void _bad;
  });

  it('EntitlementValue accepts object or callback', () => {
    const _obj: EntitlementValue = { roles: ['admin'] };
    const _cb: EntitlementValue = (r: RuleContext) => ({
      roles: ['admin'],
      rules: [r.where({ createdBy: r.user.id })],
    });
    void _obj;
    void _cb;
  });
});

describe('Type flow: rules builders return typed rule objects', () => {
  it('rules.role returns RoleRule', () => {
    const rule = rules.role('admin');
    const _type: 'role' = rule.type;
    void _type;
  });

  it('rules.entitlement returns EntitlementRule', () => {
    const rule = rules.entitlement('project:view');
    const _type: 'entitlement' = rule.type;
    void _type;
  });

  it('rules.where returns WhereRule', () => {
    const rule = rules.where({ archived: false });
    const _type: 'where' = rule.type;
    void _type;
  });

  it('rules.all returns AllRule', () => {
    const rule = rules.all(rules.role('admin'));
    const _type: 'all' = rule.type;
    void _type;
  });

  it('rules.any returns AnyRule', () => {
    const rule = rules.any(rules.role('admin'));
    const _type: 'any' = rule.type;
    void _type;
  });

  it('rules.authenticated returns AuthenticatedRule', () => {
    const rule = rules.authenticated();
    const _type: 'authenticated' = rule.type;
    void _type;
  });

  it('rules.fva returns FvaRule', () => {
    const rule = rules.fva(600);
    const _type: 'fva' = rule.type;
    void _type;
  });
});

describe('Type flow: createAccessContext → AccessContext', () => {
  it('returns AccessContext with can/check/authorize/canAll', () => {
    const closureStore: ClosureStore = new InMemoryClosureStore();
    const roleStore: RoleAssignmentStore = new InMemoryRoleAssignmentStore();
    const config = defineAccess({
      entities: {
        organization: { roles: ['admin'] },
      },
      entitlements: { 'organization:manage': { roles: ['admin'] } },
    });

    const ctx: AccessContext = createAccessContext({
      userId: 'user-1',
      accessDef: config,
      closureStore,
      roleStore,
    });

    // Positive: all methods exist with correct signatures
    const _can: Promise<boolean> = ctx.can('organization:manage');
    const _check: Promise<AccessCheckResult> = ctx.check('organization:manage');
    const _authorize: Promise<void> = ctx.authorize('organization:manage');
    const _canAll: Promise<Map<string, boolean>> = ctx.canAll([]);
    void _can;
    void _check;
    void _authorize;
    void _canAll;
  });

  it('InMemoryClosureStore implements ClosureStore', () => {
    const _store: ClosureStore = new InMemoryClosureStore();
    void _store;
  });

  it('InMemoryRoleAssignmentStore implements RoleAssignmentStore', () => {
    const _store: RoleAssignmentStore = new InMemoryRoleAssignmentStore();
    void _store;
  });
});
