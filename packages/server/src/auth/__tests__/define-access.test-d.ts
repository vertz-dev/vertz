/**
 * Type-level tests for defineAccess and access context types [#1020]
 */
import { describe, it } from 'bun:test';
import type { AccessContext } from '../access-context';
import type {
  AccessCheckResult,
  AccessDefinition,
  DenialReason,
  EntitlementDef,
} from '../define-access';
import { defineAccess } from '../define-access';

describe('Type-level: defineAccess', () => {
  it('returns AccessDefinition type', () => {
    const def = defineAccess({
      hierarchy: ['Org'],
      roles: { Org: ['admin'] },
      entitlements: { 'org:manage': { roles: ['admin'] } },
    });
    const _val: AccessDefinition = def;
    void _val;
  });

  it('hierarchy is readonly', () => {
    const def = defineAccess({
      hierarchy: ['Org'],
      roles: { Org: ['admin'] },
      entitlements: {},
    });
    // @ts-expect-error — cannot push to readonly array
    def.hierarchy.push('Other');
  });

  it('config is frozen (readonly)', () => {
    const def = defineAccess({
      hierarchy: ['Org'],
      roles: { Org: ['admin'] },
      entitlements: {},
    });
    // @ts-expect-error — cannot reassign readonly property
    def.hierarchy = [];
  });

  it('DenialReason rejects invalid values', () => {
    // @ts-expect-error — not a valid DenialReason
    const _bad: DenialReason = 'made_up_reason';
    void _bad;
  });

  it('EntitlementDef requires roles', () => {
    // @ts-expect-error — roles is required
    const _bad: EntitlementDef = { plans: ['pro'] };
    void _bad;
  });

  it('AccessCheckResult has correct shape', () => {
    const result: AccessCheckResult = {
      allowed: false,
      reasons: ['role_required'],
      reason: 'role_required',
      meta: { requiredRoles: ['admin'] },
    };
    const _allowed: boolean = result.allowed;
    void _allowed;
  });

  it('AccessContext methods return correct types', () => {
    // Just validate types compile — no runtime needed
    type CanReturn = ReturnType<AccessContext['can']>;
    type CheckReturn = ReturnType<AccessContext['check']>;
    type AuthorizeReturn = ReturnType<AccessContext['authorize']>;
    type CanAllReturn = ReturnType<AccessContext['canAll']>;

    const _can: CanReturn = Promise.resolve(true);
    const _check: CheckReturn = Promise.resolve({
      allowed: true,
      reasons: [] as DenialReason[],
    });
    const _authorize: AuthorizeReturn = Promise.resolve();
    const _canAll: CanAllReturn = Promise.resolve(new Map<string, boolean>());

    void _can;
    void _check;
    void _authorize;
    void _canAll;
  });
});
