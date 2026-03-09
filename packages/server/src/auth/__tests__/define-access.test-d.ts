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
import type { LimitOverride, OrgPlan, PlanStore } from '../plan-store';
import type { ConsumeResult, WalletEntry, WalletStore } from '../wallet-store';

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
    type CanAndConsumeReturn = ReturnType<AccessContext['canAndConsume']>;
    type UnconsumeReturn = ReturnType<AccessContext['unconsume']>;

    const _can: CanReturn = Promise.resolve(true);
    const _check: CheckReturn = Promise.resolve({
      allowed: true,
      reasons: [] as DenialReason[],
    });
    const _authorize: AuthorizeReturn = Promise.resolve();
    const _canAll: CanAllReturn = Promise.resolve(new Map<string, boolean>());
    const _canAndConsume: CanAndConsumeReturn = Promise.resolve(true);
    const _unconsume: UnconsumeReturn = Promise.resolve();

    void _can;
    void _check;
    void _authorize;
    void _canAll;
    void _canAndConsume;
    void _unconsume;
  });

  // ─── canAndConsume return type must be Promise<boolean> ──────────────
  it('canAndConsume returns Promise<boolean>, not boolean', () => {
    // @ts-expect-error — canAndConsume returns Promise<boolean>, not boolean
    const _bad: boolean = null as unknown as ReturnType<AccessContext['canAndConsume']>;
    void _bad;
  });

  // ─── unconsume return type must be Promise<void> ────────────────────
  it('unconsume returns Promise<void>, not void', () => {
    // @ts-expect-error — unconsume returns Promise<void>, not void
    const _bad: void = null as unknown as ReturnType<AccessContext['unconsume']>;
    void _bad;
  });
});

describe('Type-level: PlanStore', () => {
  it('PlanStore has required methods', () => {
    const store: PlanStore = {} as PlanStore;
    const _assign: (orgId: string, planId: string) => void = store.assignPlan;
    const _get: (orgId: string) => OrgPlan | null = store.getPlan;
    const _update: (orgId: string, overrides: Record<string, LimitOverride>) => void =
      store.updateOverrides;
    const _remove: (orgId: string) => void = store.removePlan;
    const _dispose: () => void = store.dispose;
    void _assign;
    void _get;
    void _update;
    void _remove;
    void _dispose;
  });

  it('OrgPlan has correct shape', () => {
    const plan: OrgPlan = {
      orgId: 'org-1',
      planId: 'free',
      startedAt: new Date(),
      expiresAt: null,
      overrides: {},
    };
    const _orgId: string = plan.orgId;
    const _planId: string = plan.planId;
    const _startedAt: Date = plan.startedAt;
    const _expiresAt: Date | null = plan.expiresAt;
    const _overrides: Record<string, LimitOverride> = plan.overrides;
    void _orgId;
    void _planId;
    void _startedAt;
    void _expiresAt;
    void _overrides;
  });

  it('LimitOverride only has max, not per', () => {
    const override: LimitOverride = { max: 100 };
    // @ts-expect-error — LimitOverride does not have 'per' property
    override.per;
    void override;
  });
});

describe('Type-level: WalletStore', () => {
  it('WalletStore.consume returns Promise<ConsumeResult>', () => {
    const store: WalletStore = {} as WalletStore;
    const _result: Promise<ConsumeResult> = store.consume(
      'org-1',
      'ent',
      new Date(),
      new Date(),
      10,
    );
    void _result;
  });

  it('WalletStore.unconsume returns Promise<void>', () => {
    const store: WalletStore = {} as WalletStore;
    const _result: Promise<void> = store.unconsume('org-1', 'ent', new Date(), new Date());
    void _result;
  });

  it('WalletStore.getConsumption returns Promise<number>', () => {
    const store: WalletStore = {} as WalletStore;
    const _result: Promise<number> = store.getConsumption('org-1', 'ent', new Date(), new Date());
    void _result;
  });

  it('ConsumeResult has correct shape', () => {
    const result: ConsumeResult = { success: true, consumed: 1, limit: 10, remaining: 9 };
    const _success: boolean = result.success;
    const _consumed: number = result.consumed;
    const _limit: number = result.limit;
    const _remaining: number = result.remaining;
    void _success;
    void _consumed;
    void _limit;
    void _remaining;
  });

  it('WalletEntry has correct shape', () => {
    const entry: WalletEntry = {
      orgId: 'org-1',
      entitlement: 'project:create',
      periodStart: new Date(),
      periodEnd: new Date(),
      consumed: 5,
    };
    const _orgId: string = entry.orgId;
    const _ent: string = entry.entitlement;
    const _start: Date = entry.periodStart;
    const _end: Date = entry.periodEnd;
    const _consumed: number = entry.consumed;
    void _orgId;
    void _ent;
    void _start;
    void _end;
    void _consumed;
  });

  it('ConsumeResult rejects missing fields', () => {
    // @ts-expect-error — missing required fields
    const _bad: ConsumeResult = { success: true };
    void _bad;
  });
});
