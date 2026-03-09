/**
 * Access Context — the resolution engine for can/check/authorize/canAll.
 *
 * Evaluates access rules against the defineAccess() config,
 * closure table, and role assignments using 5-layer resolution.
 *
 * Layers (cheapest-first for can(), all-layers for check()):
 * 1. Feature flags (requires flagStore + orgResolver)
 * 2. RBAC (effective role check)
 * 3. Hierarchy (closure table path check)
 * 4. Plan check (requires planStore + orgResolver)
 * 5. Wallet check (requires walletStore + planStore + orgResolver)
 */

import { AuthorizationError } from './access';
import { calculateBillingPeriod } from './billing-period';
import type { ClosureStore } from './closure-store';
import type {
  AccessCheckResult,
  AccessDefinition,
  DenialMeta,
  DenialReason,
  LimitDef,
} from './define-access';
import type { FlagStore } from './flag-store';
import { type OrgPlan, type PlanStore, resolveEffectivePlan } from './plan-store';
import type { RoleAssignmentStore } from './role-assignment-store';
import type { WalletStore } from './wallet-store';

// ============================================================================
// Types
// ============================================================================

export interface ResourceRef {
  type: string;
  id: string;
}

export interface AccessContextConfig {
  userId: string | null;
  accessDef: AccessDefinition;
  closureStore: ClosureStore;
  roleStore: RoleAssignmentStore;
  /** Factor verification age — seconds since last MFA. undefined if no MFA done. */
  fva?: number;
  /** Flag store — required for Layer 1 feature flag checks */
  flagStore?: FlagStore;
  /** Plan store — required for Layer 4 plan checks */
  planStore?: PlanStore;
  /** Wallet store — required for Layer 5 wallet checks and canAndConsume() */
  walletStore?: WalletStore;
  /** Resolves an org ID from a resource. Required for plan/wallet checks. */
  orgResolver?: (resource?: ResourceRef) => Promise<string | null>;
}

export interface AccessContext {
  can(entitlement: string, resource?: ResourceRef): Promise<boolean>;
  check(entitlement: string, resource?: ResourceRef): Promise<AccessCheckResult>;
  authorize(entitlement: string, resource?: ResourceRef): Promise<void>;
  canAll(
    checks: Array<{ entitlement: string; resource?: ResourceRef }>,
  ): Promise<Map<string, boolean>>;
  /** Atomic check + consume. Runs full can() then increments wallet if all layers pass. */
  canAndConsume(entitlement: string, resource?: ResourceRef, amount?: number): Promise<boolean>;
  /** Rollback a previous canAndConsume(). Use when the operation fails after consumption. */
  unconsume(entitlement: string, resource?: ResourceRef, amount?: number): Promise<void>;
}

const MAX_BULK_CHECKS = 100;

// ============================================================================
// createAccessContext()
// ============================================================================

export function createAccessContext(config: AccessContextConfig): AccessContext {
  const {
    userId,
    accessDef,
    closureStore,
    roleStore,
    flagStore,
    planStore,
    walletStore,
    orgResolver,
  } = config;

  // ==========================================================================
  // checkLayers1to4() — internal, checks Layers 1-4 with pre-resolved orgId
  // ==========================================================================

  function checkLayers1to4(
    entitlement: string,
    resource: ResourceRef | undefined,
    resolvedOrgId: string | null,
  ): boolean {
    // Unauthenticated user — deny immediately
    if (!userId) return false;

    const entDef = accessDef.entitlements[entitlement];
    if (!entDef) return false; // Unknown entitlement — deny

    // Layer 1: Feature flags
    if (entDef.flags?.length && flagStore && orgResolver) {
      if (!resolvedOrgId) return false;
      for (const flag of entDef.flags) {
        if (!flagStore.getFlag(resolvedOrgId, flag)) {
          return false;
        }
      }
    }

    // Layer 2: RBAC check
    if (entDef.roles.length > 0 && resource) {
      const effectiveRole = roleStore.getEffectiveRole(
        userId,
        resource.type,
        resource.id,
        accessDef,
        closureStore,
      );
      if (!effectiveRole || !entDef.roles.includes(effectiveRole)) {
        return false;
      }
    } else if (entDef.roles.length > 0 && !resource) {
      // Global check — no resource context, deny if roles are required
      return false;
    }

    // Layer 3: Hierarchy check (implicit — already handled via closure table in getEffectiveRole)

    // Layer 4: Plan check
    if (entDef.plans?.length && planStore && orgResolver) {
      if (!resolvedOrgId) return false; // Cannot resolve org — deny

      const orgPlan = planStore.getPlan(resolvedOrgId);
      const effectivePlanId = resolveEffectivePlan(orgPlan, accessDef.plans, accessDef.defaultPlan);
      if (!effectivePlanId) return false; // No plan — deny

      const planDef = accessDef.plans?.[effectivePlanId];
      if (!planDef || !planDef.entitlements.includes(entitlement)) {
        return false; // Plan doesn't include this entitlement
      }
    }

    return true;
  }

  // ==========================================================================
  // can() — short-circuits cheapest-first
  // ==========================================================================

  async function can(entitlement: string, resource?: ResourceRef): Promise<boolean> {
    // Resolve org once for all layers
    const resolvedOrgId = orgResolver ? await orgResolver(resource) : null;

    if (!checkLayers1to4(entitlement, resource, resolvedOrgId)) return false;

    // Layer 5: Wallet check (read-only — for UI display, not atomic)
    const entDef = accessDef.entitlements[entitlement];
    if (entDef?.plans?.length && walletStore && planStore && resolvedOrgId) {
      const walletState = await resolveWalletStateFromOrgId(
        entitlement,
        resolvedOrgId,
        accessDef,
        planStore,
        walletStore,
      );
      if (walletState && walletState.consumed >= walletState.limit) {
        return false;
      }
    }

    return true;
  }

  // ==========================================================================
  // check() — evaluates ALL layers, returns structured result
  // ==========================================================================

  async function check(entitlement: string, resource?: ResourceRef): Promise<AccessCheckResult> {
    const reasons: DenialReason[] = [];
    const meta: DenialMeta = {};

    // Unauthenticated
    if (!userId) {
      return {
        allowed: false,
        reasons: ['not_authenticated'],
        reason: 'not_authenticated',
      };
    }

    const entDef = accessDef.entitlements[entitlement];
    if (!entDef) {
      return {
        allowed: false,
        reasons: ['role_required'],
        reason: 'role_required',
      };
    }

    // Resolve org once for all layers
    const resolvedOrgId = orgResolver ? await orgResolver(resource) : null;

    // Layer 1: Feature flags
    if (entDef.flags?.length && flagStore && orgResolver) {
      if (resolvedOrgId) {
        const disabledFlags: string[] = [];
        for (const flag of entDef.flags) {
          if (!flagStore.getFlag(resolvedOrgId, flag)) {
            disabledFlags.push(flag);
          }
        }
        if (disabledFlags.length > 0) {
          reasons.push('flag_disabled');
          meta.disabledFlags = disabledFlags;
        }
      } else {
        reasons.push('flag_disabled');
        meta.disabledFlags = [...entDef.flags];
      }
    }

    // Layer 2: RBAC
    if (entDef.roles.length > 0) {
      let hasRole = false;
      if (resource) {
        const effectiveRole = roleStore.getEffectiveRole(
          userId,
          resource.type,
          resource.id,
          accessDef,
          closureStore,
        );
        hasRole = !!effectiveRole && entDef.roles.includes(effectiveRole);
      }
      if (!hasRole) {
        reasons.push('role_required');
        meta.requiredRoles = [...entDef.roles];
      }
    }

    // Layer 3: Hierarchy (implicit via effective role)

    // Layer 4: Plan check
    if (entDef.plans?.length && planStore && orgResolver) {
      let planDenied = false;

      if (!resolvedOrgId) {
        planDenied = true;
      } else {
        const orgPlan = planStore.getPlan(resolvedOrgId);
        const effectivePlanId = resolveEffectivePlan(
          orgPlan,
          accessDef.plans,
          accessDef.defaultPlan,
        );
        if (!effectivePlanId) {
          planDenied = true;
        } else {
          const planDef = accessDef.plans?.[effectivePlanId];
          if (!planDef || !planDef.entitlements.includes(entitlement)) {
            planDenied = true;
          }
        }
      }

      if (planDenied) {
        reasons.push('plan_required');
        meta.requiredPlans = [...entDef.plans];
      }
    }

    // Layer 5: Wallet check
    if (entDef.plans?.length && walletStore && planStore && resolvedOrgId) {
      const walletState = await resolveWalletStateFromOrgId(
        entitlement,
        resolvedOrgId,
        accessDef,
        planStore,
        walletStore,
      );
      if (walletState) {
        meta.limit = {
          max: walletState.limit,
          consumed: walletState.consumed,
          remaining: Math.max(0, walletState.limit - walletState.consumed),
        };
        if (walletState.consumed >= walletState.limit) {
          reasons.push('limit_reached');
        }
      }
    }

    // Order denial reasons by actionability
    const orderedReasons = orderDenialReasons(reasons);

    return {
      allowed: orderedReasons.length === 0,
      reasons: orderedReasons,
      reason: orderedReasons[0],
      meta: Object.keys(meta).length > 0 ? meta : undefined,
    };
  }

  // ==========================================================================
  // authorize() — throws on denial
  // ==========================================================================

  async function authorize(entitlement: string, resource?: ResourceRef): Promise<void> {
    const result = await can(entitlement, resource);
    if (!result) {
      throw new AuthorizationError(
        `Not authorized: ${entitlement}`,
        entitlement,
        userId ?? undefined,
      );
    }
  }

  // ==========================================================================
  // canAll() — bulk check
  // ==========================================================================

  async function canAll(
    checks: Array<{ entitlement: string; resource?: ResourceRef }>,
  ): Promise<Map<string, boolean>> {
    if (checks.length > MAX_BULK_CHECKS) {
      throw new Error(`canAll() is limited to ${MAX_BULK_CHECKS} checks per call`);
    }

    const results = new Map<string, boolean>();

    for (const { entitlement, resource } of checks) {
      const key = resource ? `${entitlement}:${resource.id}` : entitlement;
      const allowed = await can(entitlement, resource);
      results.set(key, allowed);
    }

    return results;
  }

  // ==========================================================================
  // canAndConsume() — atomic check + consume
  // ==========================================================================

  /**
   * Runs Layers 1-4 access check, then atomically attempts to consume from the wallet.
   * The wallet consume is atomic, but the access check and consume are not a single
   * atomic operation -- concurrent requests may see stale state in the access check.
   */
  async function canAndConsume(
    entitlement: string,
    resource?: ResourceRef,
    amount = 1,
  ): Promise<boolean> {
    // Resolve org once for all layers
    const resolvedOrgId = orgResolver ? await orgResolver(resource) : null;

    // Run Layers 1-4 (skips Layer 5 wallet read to avoid TOCTOU)
    if (!checkLayers1to4(entitlement, resource, resolvedOrgId)) return false;

    // If no wallet/plan infrastructure, just return true (no limit to enforce)
    if (!walletStore || !planStore || !orgResolver) return true;

    const entDef = accessDef.entitlements[entitlement];
    if (!entDef?.plans?.length) return true; // No plan requirement, no limit possible

    if (!resolvedOrgId) return false;

    const orgPlan = planStore.getPlan(resolvedOrgId);
    if (!orgPlan) return false;
    const effectivePlanId = resolveEffectivePlan(orgPlan, accessDef.plans, accessDef.defaultPlan);
    if (!effectivePlanId) return false;

    const planDef = accessDef.plans?.[effectivePlanId];
    if (!planDef) return false;

    const limitDef = planDef.limits?.[entitlement];
    if (!limitDef) return true; // No limit on this entitlement — always allowed

    // Resolve effective limit (max of override and plan limit)
    const effectiveLimit = resolveEffectiveLimit(orgPlan, entitlement, limitDef);

    // Calculate billing period
    const { periodStart, periodEnd } = calculateBillingPeriod(orgPlan.startedAt, limitDef.per);

    // Atomic consume
    const result = await walletStore.consume(
      resolvedOrgId,
      entitlement,
      periodStart,
      periodEnd,
      effectiveLimit,
      amount,
    );

    return result.success;
  }

  // ==========================================================================
  // unconsume() — rollback
  // ==========================================================================

  async function unconsume(entitlement: string, resource?: ResourceRef, amount = 1): Promise<void> {
    if (!walletStore || !planStore || !orgResolver) return;

    const entDef = accessDef.entitlements[entitlement];
    if (!entDef?.plans?.length) return;

    const orgId = await orgResolver(resource);
    if (!orgId) return;

    const orgPlan = planStore.getPlan(orgId);
    if (!orgPlan) return;
    const effectivePlanId = resolveEffectivePlan(orgPlan, accessDef.plans, accessDef.defaultPlan);
    if (!effectivePlanId) return;

    const planDef = accessDef.plans?.[effectivePlanId];
    const limitDef = planDef?.limits?.[entitlement];
    if (!limitDef) return;

    const { periodStart, periodEnd } = calculateBillingPeriod(orgPlan.startedAt, limitDef.per);

    await walletStore.unconsume(orgId, entitlement, periodStart, periodEnd, amount);
  }

  return { can, check, authorize, canAll, canAndConsume, unconsume };
}

// ============================================================================
// Helpers
// ============================================================================

const DENIAL_ORDER: DenialReason[] = [
  'plan_required',
  'role_required',
  'limit_reached',
  'flag_disabled',
  'hierarchy_denied',
  'step_up_required',
  'not_authenticated',
];

function orderDenialReasons(reasons: DenialReason[]): DenialReason[] {
  return [...reasons].sort((a, b) => DENIAL_ORDER.indexOf(a) - DENIAL_ORDER.indexOf(b));
}

interface WalletState {
  limit: number;
  consumed: number;
}

/**
 * Resolve the current wallet state for an entitlement using a pre-resolved org ID.
 * Returns null if no limit is configured for this entitlement.
 */
async function resolveWalletStateFromOrgId(
  entitlement: string,
  orgId: string,
  accessDef: AccessDefinition,
  planStore: PlanStore,
  walletStore: WalletStore,
): Promise<WalletState | null> {
  const orgPlan = planStore.getPlan(orgId);
  const effectivePlanId = resolveEffectivePlan(orgPlan, accessDef.plans, accessDef.defaultPlan);
  if (!effectivePlanId || !orgPlan) return null;

  const planDef = accessDef.plans?.[effectivePlanId];
  const limitDef = planDef?.limits?.[entitlement];
  if (!limitDef) return null;

  const effectiveLimit = resolveEffectiveLimit(orgPlan, entitlement, limitDef);
  const { periodStart, periodEnd } = calculateBillingPeriod(orgPlan.startedAt, limitDef.per);
  const consumed = await walletStore.getConsumption(orgId, entitlement, periodStart, periodEnd);

  return { limit: effectiveLimit, consumed };
}

/**
 * Resolve the effective limit for an entitlement.
 * Uses max(override, plan_limit) — overrides can only increase limits.
 */
function resolveEffectiveLimit(orgPlan: OrgPlan, entitlement: string, planLimit: LimitDef): number {
  const override = orgPlan.overrides[entitlement];
  if (!override) return planLimit.max;
  return Math.max(override.max, planLimit.max);
}
