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
  /** Batch check: single entitlement across multiple entities. Returns Map<entityId, boolean>. */
  canBatch(entitlement: string, resources: ResourceRef[]): Promise<Map<string, boolean>>;
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
  // checkLayers1to3() — internal, checks Layers 1-4 with pre-resolved orgId
  // ==========================================================================

  async function checkLayers1to3(
    entitlement: string,
    resource: ResourceRef | undefined,
    resolvedOrgId: string | null,
  ): Promise<boolean> {
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
      const effectiveRole = await roleStore.getEffectiveRole(
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

    // Layer 3: Plan features check (new in Phase 2)
    if (accessDef._planGatedEntitlements.has(entitlement) && planStore && orgResolver) {
      if (!resolvedOrgId) return false; // Cannot resolve org — deny

      const orgPlan = await planStore.getPlan(resolvedOrgId);
      const effectivePlanId = resolveEffectivePlan(orgPlan, accessDef.plans, accessDef.defaultPlan);
      if (!effectivePlanId) return false; // No plan — deny

      // Check if entitlement is in effective features (base plan + add-ons)
      const hasFeature = await resolveEffectiveFeatures(
        resolvedOrgId,
        entitlement,
        effectivePlanId,
        accessDef,
        planStore,
      );
      if (!hasFeature) return false;
    }

    return true;
  }

  // ==========================================================================
  // can() — short-circuits cheapest-first
  // ==========================================================================

  async function can(entitlement: string, resource?: ResourceRef): Promise<boolean> {
    // Resolve org once for all layers
    const resolvedOrgId = orgResolver ? await orgResolver(resource) : null;

    if (!(await checkLayers1to3(entitlement, resource, resolvedOrgId))) return false;

    // Layer 4: Limit check (read-only — for UI display, not atomic)
    const limitKeys = accessDef._entitlementToLimitKeys[entitlement];
    if (limitKeys?.length && walletStore && planStore && resolvedOrgId) {
      const walletStates = await resolveAllLimitStates(
        entitlement,
        resolvedOrgId,
        accessDef,
        planStore,
        walletStore,
      );
      for (const ws of walletStates) {
        if (ws.max === 0) return false; // disabled
        if (ws.max === -1) continue; // unlimited
        if (ws.consumed >= ws.max) return false;
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
        const effectiveRole = await roleStore.getEffectiveRole(
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

    // Layer 3: Plan features check
    if (accessDef._planGatedEntitlements.has(entitlement) && planStore && orgResolver) {
      let planDenied = false;

      if (!resolvedOrgId) {
        planDenied = true;
      } else {
        const orgPlan = await planStore.getPlan(resolvedOrgId);
        const effectivePlanId = resolveEffectivePlan(
          orgPlan,
          accessDef.plans,
          accessDef.defaultPlan,
        );
        if (!effectivePlanId) {
          planDenied = true;
        } else {
          const hasFeature = await resolveEffectiveFeatures(
            resolvedOrgId,
            entitlement,
            effectivePlanId,
            accessDef,
            planStore,
          );
          if (!hasFeature) {
            planDenied = true;
          }
        }
      }

      if (planDenied) {
        reasons.push('plan_required');
        // Collect all plans that include this entitlement as feature
        const plansWithFeature: string[] = [];
        if (accessDef.plans) {
          for (const [pName, pDef] of Object.entries(accessDef.plans)) {
            if (pDef.features?.includes(entitlement)) {
              plansWithFeature.push(pName);
            }
          }
        }
        meta.requiredPlans = plansWithFeature;
      }
    }

    // Layer 4: Limit check
    const checkLimitKeys = accessDef._entitlementToLimitKeys[entitlement];
    if (checkLimitKeys?.length && walletStore && planStore && resolvedOrgId) {
      const walletStates = await resolveAllLimitStates(
        entitlement,
        resolvedOrgId,
        accessDef,
        planStore,
        walletStore,
      );
      for (const ws of walletStates) {
        if (ws.max === 0 || (ws.max !== -1 && ws.consumed >= ws.max)) {
          reasons.push('limit_reached');
          meta.limit = {
            key: ws.key,
            max: ws.max,
            consumed: ws.consumed,
            remaining: Math.max(0, ws.max === -1 ? Infinity : ws.max - ws.consumed),
          };
          break; // Report first blocking limit
        }
        // Attach limit meta even if passing (for UI display)
        if (!meta.limit) {
          meta.limit = {
            key: ws.key,
            max: ws.max,
            consumed: ws.consumed,
            remaining: ws.max === -1 ? Infinity : Math.max(0, ws.max - ws.consumed),
          };
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
  // canBatch() — single entitlement across multiple entities
  // ==========================================================================

  async function canBatch(
    entitlement: string,
    resources: ResourceRef[],
  ): Promise<Map<string, boolean>> {
    if (resources.length > MAX_BULK_CHECKS) {
      throw new Error(`canBatch() is limited to ${MAX_BULK_CHECKS} resources per call`);
    }

    const results = new Map<string, boolean>();

    for (const resource of resources) {
      const allowed = await can(entitlement, resource);
      results.set(resource.id, allowed);
    }

    return results;
  }

  // ==========================================================================
  // canAndConsume() — atomic check + consume
  // ==========================================================================

  /**
   * Runs Layers 1-3 access check, then atomically attempts to consume from ALL
   * limits gating the entitlement. All-or-nothing: if any limit fails, no consumption.
   */
  async function canAndConsume(
    entitlement: string,
    resource?: ResourceRef,
    amount = 1,
  ): Promise<boolean> {
    // Resolve org once for all layers
    const resolvedOrgId = orgResolver ? await orgResolver(resource) : null;

    // Run Layers 1-3 (auth, flags, roles, plan features — skips limit layer)
    if (!(await checkLayers1to3(entitlement, resource, resolvedOrgId))) return false;

    // If no wallet/plan infrastructure, just return true (no limit to enforce)
    if (!walletStore || !planStore || !orgResolver) return true;

    // Check if this entitlement has limits
    const limitKeys = accessDef._entitlementToLimitKeys[entitlement];
    if (!limitKeys?.length) return true; // No limits on this entitlement

    if (!resolvedOrgId) return false;

    const orgPlan = await planStore.getPlan(resolvedOrgId);
    if (!orgPlan) return false;
    const effectivePlanId = resolveEffectivePlan(orgPlan, accessDef.plans, accessDef.defaultPlan);
    if (!effectivePlanId) return false;

    // Resolve all limits and consume atomically
    const limitsToConsume = await resolveAllLimitConsumptions(
      resolvedOrgId,
      entitlement,
      effectivePlanId,
      accessDef,
      planStore,
      walletStore,
      orgPlan,
    );

    if (!limitsToConsume.length) return true; // No applicable limits

    // Atomic all-or-nothing consumption
    const consumed: Array<{
      key: string;
      periodStart: Date;
      periodEnd: Date;
    }> = [];

    for (const lc of limitsToConsume) {
      if (lc.effectiveMax === -1) continue; // Unlimited — skip
      if (lc.effectiveMax === 0) {
        // Disabled — rollback any prior consumption and fail
        await rollbackConsumptions(resolvedOrgId, consumed, walletStore, amount);
        return false;
      }

      const result = await walletStore.consume(
        resolvedOrgId,
        lc.walletKey,
        lc.periodStart,
        lc.periodEnd,
        lc.effectiveMax,
        amount,
      );

      if (!result.success) {
        // Rollback prior consumptions
        await rollbackConsumptions(resolvedOrgId, consumed, walletStore, amount);
        return false;
      }

      consumed.push({
        key: lc.walletKey,
        periodStart: lc.periodStart,
        periodEnd: lc.periodEnd,
      });
    }

    return true;
  }

  // ==========================================================================
  // unconsume() — rollback
  // ==========================================================================

  async function unconsume(entitlement: string, resource?: ResourceRef, amount = 1): Promise<void> {
    if (!walletStore || !planStore || !orgResolver) return;

    const limitKeys = accessDef._entitlementToLimitKeys[entitlement];
    if (!limitKeys?.length) return;

    const orgId = await orgResolver(resource);
    if (!orgId) return;

    const orgPlan = await planStore.getPlan(orgId);
    if (!orgPlan) return;
    const effectivePlanId = resolveEffectivePlan(orgPlan, accessDef.plans, accessDef.defaultPlan);
    if (!effectivePlanId) return;

    // Unconsume from all limits that gate this entitlement
    const limitsToUnconsume = await resolveAllLimitConsumptions(
      orgId,
      entitlement,
      effectivePlanId,
      accessDef,
      planStore,
      walletStore,
      orgPlan,
    );

    for (const lc of limitsToUnconsume) {
      if (lc.effectiveMax === -1) continue; // Unlimited — no wallet entry
      await walletStore.unconsume(orgId, lc.walletKey, lc.periodStart, lc.periodEnd, amount);
    }
  }

  return { can, check, authorize, canAll, canBatch, canAndConsume, unconsume };
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

/**
 * Check if the entitlement is in the effective features (base plan + add-ons).
 */
async function resolveEffectiveFeatures(
  orgId: string,
  entitlement: string,
  effectivePlanId: string,
  accessDef: AccessDefinition,
  planStore: PlanStore,
): Promise<boolean> {
  const planDef = accessDef.plans?.[effectivePlanId];
  if (planDef?.features?.includes(entitlement)) return true;

  // Check add-ons
  const addOns = await planStore.getAddOns?.(orgId);
  if (addOns) {
    for (const addOnId of addOns) {
      const addOnDef = accessDef.plans?.[addOnId];
      if (addOnDef?.features?.includes(entitlement)) return true;
    }
  }

  return false;
}

interface LimitState {
  key: string;
  max: number;
  consumed: number;
}

/**
 * Resolve all limit states for an entitlement.
 * Returns states for ALL limits that gate this entitlement.
 */
async function resolveAllLimitStates(
  entitlement: string,
  orgId: string,
  accessDef: AccessDefinition,
  planStore: PlanStore,
  walletStore: WalletStore,
): Promise<LimitState[]> {
  const orgPlan = await planStore.getPlan(orgId);
  const effectivePlanId = resolveEffectivePlan(orgPlan, accessDef.plans, accessDef.defaultPlan);
  if (!effectivePlanId || !orgPlan) return [];

  const limitKeys = accessDef._entitlementToLimitKeys[entitlement];
  if (!limitKeys?.length) return [];

  const states: LimitState[] = [];

  for (const limitKey of limitKeys) {
    // Find the limit definition in the effective plan
    const planDef = accessDef.plans?.[effectivePlanId];
    const limitDef = planDef?.limits?.[limitKey];
    if (!limitDef) continue;

    // Compute effective max (base + add-ons)
    let effectiveMax = limitDef.max;

    // Add add-on limits
    const addOns = await planStore.getAddOns?.(orgId);
    if (addOns) {
      for (const addOnId of addOns) {
        const addOnDef = accessDef.plans?.[addOnId];
        const addOnLimit = addOnDef?.limits?.[limitKey];
        if (addOnLimit) {
          if (effectiveMax === -1) break; // Already unlimited
          effectiveMax += addOnLimit.max;
        }
      }
    }

    // Apply per-customer overrides
    const override = orgPlan.overrides[limitKey];
    if (override) {
      effectiveMax = Math.max(effectiveMax, override.max);
    }

    if (effectiveMax === -1) {
      states.push({ key: limitKey, max: -1, consumed: 0 });
      continue;
    }

    // Resolve wallet key and billing period
    const walletKey = limitKey;
    const period = limitDef.per
      ? calculateBillingPeriod(orgPlan.startedAt, limitDef.per)
      : { periodStart: orgPlan.startedAt, periodEnd: new Date('9999-12-31T23:59:59Z') };

    const consumed = await walletStore.getConsumption(
      orgId,
      walletKey,
      period.periodStart,
      period.periodEnd,
    );

    states.push({ key: limitKey, max: effectiveMax, consumed });
  }

  return states;
}

interface LimitConsumption {
  walletKey: string;
  periodStart: Date;
  periodEnd: Date;
  effectiveMax: number;
}

/**
 * Resolve all limits for consumption (canAndConsume / unconsume).
 */
async function resolveAllLimitConsumptions(
  orgId: string,
  entitlement: string,
  effectivePlanId: string,
  accessDef: AccessDefinition,
  planStore: PlanStore,
  _walletStore: WalletStore,
  orgPlan: OrgPlan,
): Promise<LimitConsumption[]> {
  const limitKeys = accessDef._entitlementToLimitKeys[entitlement];
  if (!limitKeys?.length) return [];

  const consumptions: LimitConsumption[] = [];

  for (const limitKey of limitKeys) {
    const planDef = accessDef.plans?.[effectivePlanId];
    const limitDef = planDef?.limits?.[limitKey];
    if (!limitDef) continue;

    // Compute effective max (base + add-ons)
    let effectiveMax = limitDef.max;

    const addOns = await planStore.getAddOns?.(orgId);
    if (addOns) {
      for (const addOnId of addOns) {
        const addOnDef = accessDef.plans?.[addOnId];
        const addOnLimit = addOnDef?.limits?.[limitKey];
        if (addOnLimit) {
          if (effectiveMax === -1) break;
          effectiveMax += addOnLimit.max;
        }
      }
    }

    // Apply per-customer overrides
    const override = orgPlan.overrides[limitKey];
    if (override) {
      effectiveMax = Math.max(effectiveMax, override.max);
    }

    const walletKey = limitKey;
    const period = limitDef.per
      ? calculateBillingPeriod(orgPlan.startedAt, limitDef.per)
      : { periodStart: orgPlan.startedAt, periodEnd: new Date('9999-12-31T23:59:59Z') };

    consumptions.push({
      walletKey,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      effectiveMax,
    });
  }

  return consumptions;
}

/**
 * Rollback previously consumed wallet entries (for all-or-nothing canAndConsume).
 */
async function rollbackConsumptions(
  orgId: string,
  consumed: Array<{ key: string; periodStart: Date; periodEnd: Date }>,
  walletStore: WalletStore,
  amount: number,
): Promise<void> {
  for (const c of consumed) {
    await walletStore.unconsume(orgId, c.key, c.periodStart, c.periodEnd, amount);
  }
}
