/**
 * Access Context — the resolution engine for can/check/authorize/canAll/canBatch.
 *
 * Evaluates access rules against the defineAccess() config,
 * closure table, and role assignments using 7-layer resolution.
 *
 * Layers (cheapest-first for can(), all-layers for check()):
 * 1. Auth (not_authenticated)
 * 2. Feature flags (requires flagStore + orgResolver)
 * 3. Plan features (requires subscriptionStore + orgResolver — plan-gated entitlements)
 * 4. Limits / wallet (requires walletStore + subscriptionStore — multi-limit, add-ons)
 * 5. RBAC (effective role check via closure table)
 * 6. Attribute rules (not yet implemented)
 * 7. Step-up / FVA (not yet implemented)
 */

import { AuthorizationError } from './access';
import { calculateBillingPeriod } from './billing-period';
import type { ClosureStore } from './closure-store';
import type { CloudFailMode } from './cloud/cloud-config';
import type {
  AccessCheckResult,
  AccessDefinition,
  BillingPeriod,
  DenialMeta,
  DenialReason,
  OverageConfig,
} from './define-access';
import type { FlagStore } from './flag-store';
import type { OverrideStore, TenantOverrides } from './override-store';
import type { PlanVersionStore } from './plan-version-store';
import { resolveInheritedRole } from './resolve-inherited-role';
import type { RoleAssignmentStore } from './role-assignment-store';
import {
  resolveEffectivePlan,
  type Subscription,
  type SubscriptionStore,
} from './subscription-store';
import type { WalletStore } from './wallet-store';

// ============================================================================
// Types
// ============================================================================

export interface ResourceRef {
  type: string;
  id: string;
}

import type { AncestorChainEntry } from './access-set';
// Re-export for consumers of access-context
export type { AncestorChainEntry } from './access-set';

export interface AccessContextConfig {
  userId: string | null;
  accessDef: AccessDefinition;
  closureStore: ClosureStore;
  roleStore: RoleAssignmentStore;
  /** Factor verification age — seconds since last MFA. undefined if no MFA done. */
  fva?: number;
  /** Flag store — required for Layer 1 feature flag checks */
  flagStore?: FlagStore;
  /** Subscription store — required for Layer 4 plan checks */
  subscriptionStore?: SubscriptionStore;
  /** Wallet store — required for Layer 5 wallet checks and canAndConsume() */
  walletStore?: WalletStore;
  /** Override store — per-tenant feature and limit overrides */
  overrideStore?: OverrideStore;
  /** Resolves an org (resourceType + resourceId) from a resource. Required for plan/wallet checks. */
  orgResolver?: (resource?: ResourceRef) => Promise<{ type: string; id: string } | null>;
  /** Plan version store — required for versioned plan resolution (grandfathered tenants) */
  planVersionStore?: PlanVersionStore;
  /** Cloud failure mode — how to handle wallet store errors. Only set when using cloud wallet. */
  cloudFailMode?: CloudFailMode;
  /** Tenant level — entity type of the current tenant (e.g., 'project'). Required for cascaded consumption. */
  tenantLevel?: string;
  /** Resolves the ancestor chain from a tenant. Returns entries from child to root (sorted by depth ascending). */
  ancestorResolver?: (tenantLevel: string, tenantId: string) => Promise<AncestorChainEntry[]>;
}

/**
 * Entitlement registry — augmented by @vertz/codegen to narrow entitlement strings.
 * When empty (no codegen), Entitlement falls back to `string`.
 * When codegen runs, it populates this with `{ 'entity:action': true }` entries.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface -- augmented by codegen
export interface EntitlementRegistry {}

/** Entitlement type — narrows to literal union when codegen populates EntitlementRegistry. */
export type Entitlement = keyof EntitlementRegistry extends never
  ? string
  : Extract<keyof EntitlementRegistry, string>;

export interface AccessContext {
  can(entitlement: Entitlement, resource?: ResourceRef): Promise<boolean>;
  check(entitlement: Entitlement, resource?: ResourceRef): Promise<AccessCheckResult>;
  authorize(entitlement: Entitlement, resource?: ResourceRef): Promise<void>;
  canAll(
    checks: Array<{ entitlement: Entitlement; resource?: ResourceRef }>,
  ): Promise<Map<string, boolean>>;
  /** Batch check: single entitlement across multiple entities. Returns Map<entityId, boolean>. */
  canBatch(entitlement: Entitlement, resources: ResourceRef[]): Promise<Map<string, boolean>>;
  /** Atomic check + consume. Runs full can() then increments wallet if all layers pass. */
  canAndConsume(
    entitlement: Entitlement,
    resource?: ResourceRef,
    amount?: number,
  ): Promise<boolean>;
  /** Rollback a previous canAndConsume(). Use when the operation fails after consumption. */
  unconsume(entitlement: Entitlement, resource?: ResourceRef, amount?: number): Promise<void>;
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
    subscriptionStore,
    walletStore,
    overrideStore,
    orgResolver,
    planVersionStore,
    cloudFailMode,
    tenantLevel,
    ancestorResolver,
  } = config;

  // ==========================================================================
  // resolveAncestorChain() — build [self, ...ancestors] sorted child→root
  // ==========================================================================

  async function resolveAncestorChain(org: {
    type: string;
    id: string;
  }): Promise<AncestorChainEntry[] | null> {
    if (!ancestorResolver || !tenantLevel) return null;
    const ancestors = await ancestorResolver(tenantLevel, org.id);
    return [
      { type: org.type, id: org.id, depth: 0 },
      ...ancestors.sort((a, b) => a.depth - b.depth),
    ];
  }

  // ==========================================================================
  // resolveMultiLevelFlag() — deepest wins flag resolution
  // ==========================================================================

  function resolveMultiLevelFlag(flag: string, chain: AncestorChainEntry[]): boolean {
    // chain is sorted child→root; first match wins (deepest)
    for (const entry of chain) {
      const levelFlags = flagStore!.getFlags(entry.type, entry.id);
      if (flag in levelFlags) return levelFlags[flag]!;
    }
    return false; // No level has the flag
  }

  // ==========================================================================
  // resolveMultiLevelFeature() — inherit/local plan feature resolution
  // ==========================================================================

  async function resolveMultiLevelFeature(
    entitlement: string,
    chain: AncestorChainEntry[],
  ): Promise<boolean> {
    const entDef = accessDef.entitlements[entitlement];
    const resolution = entDef?.featureResolution ?? 'inherit';

    // Collect features per level
    for (const entry of chain) {
      if (resolution === 'local' && entry.depth !== 0) continue; // local: only deepest

      const sub = await subscriptionStore!.get(entry.type, entry.id);
      const levelDefault = accessDef.defaultPlans?.[entry.type] ?? accessDef.defaultPlan;
      const planId = resolveEffectivePlan(sub, accessDef.plans, levelDefault);
      if (!planId) continue;

      const overridesForLevel = overrideStore
        ? await overrideStore.get(entry.type, entry.id)
        : null;

      const hasFeature = await resolveEffectiveFeatures(
        { type: entry.type, id: entry.id },
        entitlement,
        planId,
        accessDef,
        subscriptionStore!,
        planVersionStore,
        overridesForLevel,
      );
      if (hasFeature) return true;
    }

    return false;
  }

  // ==========================================================================
  // checkLayers1to3() — internal, checks Layers 1-4 with pre-resolved org
  // ==========================================================================

  async function checkLayers1to3(
    entitlement: string,
    resource: ResourceRef | undefined,
    resolvedOrg: { type: string; id: string } | null,
    overrides?: TenantOverrides | null,
    chain?: AncestorChainEntry[] | null,
  ): Promise<boolean> {
    // Unauthenticated user — deny immediately
    if (!userId) return false;

    const entDef = accessDef.entitlements[entitlement];
    if (!entDef) return false; // Unknown entitlement — deny

    // Layer 1: Feature flags
    if (entDef.flags?.length && flagStore && orgResolver) {
      if (!resolvedOrg) return false;
      if (chain) {
        // Multi-level: deepest wins
        for (const flag of entDef.flags) {
          if (!resolveMultiLevelFlag(flag, chain)) return false;
        }
      } else {
        // Single-level: existing behavior
        for (const flag of entDef.flags) {
          if (!flagStore.getFlag(resolvedOrg.type, resolvedOrg.id, flag)) {
            return false;
          }
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
      if (!effectiveRole) return false;

      // Resolve inheritance when resource type differs from entitlement entity type
      const entEntityType = entitlement.substring(0, entitlement.indexOf(':'));
      let roleToCheck = effectiveRole;
      if (resource.type !== entEntityType) {
        const inherited = resolveInheritedRole(
          resource.type,
          effectiveRole,
          entEntityType,
          accessDef,
        );
        if (!inherited) return false;
        roleToCheck = inherited;
      }
      if (!entDef.roles.includes(roleToCheck)) return false;
    } else if (entDef.roles.length > 0 && !resource) {
      // Global check — no resource context, deny if roles are required
      return false;
    }

    // Layer 3: Hierarchy check (implicit — already handled via closure table in getEffectiveRole)

    // Layer 3: Plan features check
    if (accessDef._planGatedEntitlements.has(entitlement) && subscriptionStore && orgResolver) {
      if (!resolvedOrg) return false; // Cannot resolve org — deny

      if (chain) {
        // Multi-level: check features across ancestor chain (inherit/local)
        const hasFeature = await resolveMultiLevelFeature(entitlement, chain);
        if (!hasFeature) return false;
      } else {
        // Single-level: existing behavior
        const subscription = await subscriptionStore.get(resolvedOrg.type, resolvedOrg.id);
        const effectivePlanId = resolveEffectivePlan(
          subscription,
          accessDef.plans,
          accessDef.defaultPlan,
        );
        if (!effectivePlanId) return false; // No plan — deny

        // Check if entitlement is in effective features (base plan + add-ons + overrides)
        const hasFeature = await resolveEffectiveFeatures(
          resolvedOrg,
          entitlement,
          effectivePlanId,
          accessDef,
          subscriptionStore,
          planVersionStore,
          overrides,
        );
        if (!hasFeature) return false;
      }
    }

    return true;
  }

  // ==========================================================================
  // can() — short-circuits cheapest-first
  // ==========================================================================

  async function can(entitlement: string, resource?: ResourceRef): Promise<boolean> {
    // Resolve org once for all layers
    const resolvedOrg = orgResolver ? await orgResolver(resource) : null;

    // Fetch overrides once
    const overrides =
      resolvedOrg && overrideStore
        ? await overrideStore.get(resolvedOrg.type, resolvedOrg.id)
        : null;

    // Build ancestor chain once for multi-level resolution
    const chain = resolvedOrg ? await resolveAncestorChain(resolvedOrg) : null;

    if (!(await checkLayers1to3(entitlement, resource, resolvedOrg, overrides, chain)))
      return false;

    // Layer 4: Limit check (read-only — for UI display, not atomic)
    const limitKeys = accessDef._entitlementToLimitKeys[entitlement];
    if (limitKeys?.length && walletStore && subscriptionStore && resolvedOrg) {
      try {
        if (chain) {
          // Multi-level: check limits at all ancestor levels
          if (!(await checkMultiLevelLimits(entitlement, chain))) return false;
        } else {
          // Single-level: existing behavior
          const walletStates = await resolveAllLimitStates(
            entitlement,
            resolvedOrg,
            accessDef,
            subscriptionStore,
            walletStore,
            planVersionStore,
            overrides,
          );
          if (!checkLimitStates(walletStates)) return false;
        }
      } catch (error) {
        if (!cloudFailMode) throw error;
        // Cloud failure — apply failMode
        return cloudFailMode === 'open';
      }
    }

    return true;
  }

  /**
   * Check limit states for a single level. Returns false if any limit is exceeded.
   */
  function checkLimitStates(walletStates: LimitState[]): boolean {
    for (const ws of walletStates) {
      if (ws.max === 0) return false; // disabled
      if (ws.max === -1) continue; // unlimited
      if (ws.consumed >= ws.max) {
        if (ws.hasOverage) {
          if (ws.overageCap !== undefined) {
            const overageUnits = ws.consumed - ws.max;
            const overageCost = (overageUnits * (ws.overageAmount ?? 0)) / (ws.overagePer ?? 1);
            if (overageCost >= ws.overageCap) return false;
          }
          continue;
        }
        return false;
      }
    }
    return true;
  }

  /**
   * Multi-level limit check: cascade through ancestor chain.
   * If any level's limits are exceeded, deny.
   */
  async function checkMultiLevelLimits(
    entitlement: string,
    chain: AncestorChainEntry[],
  ): Promise<boolean> {
    for (const entry of chain) {
      const sub = await subscriptionStore!.get(entry.type, entry.id);
      if (!sub) continue;

      const levelDefault = accessDef.defaultPlans?.[entry.type] ?? accessDef.defaultPlan;
      const planId = resolveEffectivePlan(sub, accessDef.plans, levelDefault);
      if (!planId) continue;

      // Check if this plan has limits for the entitlement
      const limitKeys = accessDef._entitlementToLimitKeys[entitlement];
      const planDef = accessDef.plans?.[planId];
      if (!planDef?.limits || !limitKeys?.some((k) => k in planDef.limits!)) continue;

      const levelOverrides = overrideStore ? await overrideStore.get(entry.type, entry.id) : null;

      const walletStates = await resolveAllLimitStates(
        entitlement,
        { type: entry.type, id: entry.id },
        accessDef,
        subscriptionStore!,
        walletStore!,
        planVersionStore,
        levelOverrides,
      );
      if (!checkLimitStates(walletStates)) return false;
    }
    return true;
  }

  /**
   * Single-level limit check for check() — populates reasons and meta.
   */
  function checkSingleLevelLimitsForCheck(
    walletStates: LimitState[],
    reasons: DenialReason[],
    meta: DenialMeta,
  ): void {
    for (const ws of walletStates) {
      const exceeded = ws.max === 0 || (ws.max !== -1 && ws.consumed >= ws.max);
      if (exceeded) {
        if (ws.hasOverage && ws.max !== 0) {
          let capHit = false;
          if (ws.overageCap !== undefined) {
            const overageUnits = ws.consumed - ws.max;
            const overageCost = (overageUnits * (ws.overageAmount ?? 0)) / (ws.overagePer ?? 1);
            if (overageCost >= ws.overageCap) capHit = true;
          }
          if (capHit) {
            reasons.push('limit_reached');
            meta.limit = {
              key: ws.key,
              max: ws.max,
              consumed: ws.consumed,
              remaining: 0,
              overage: true,
            };
            break;
          }
          meta.limit = {
            key: ws.key,
            max: ws.max,
            consumed: ws.consumed,
            remaining: 0,
            overage: true,
          };
          continue;
        }
        reasons.push('limit_reached');
        meta.limit = {
          key: ws.key,
          max: ws.max,
          consumed: ws.consumed,
          remaining: Math.max(0, ws.max === -1 ? Infinity : ws.max - ws.consumed),
        };
        break;
      }
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

  /**
   * Multi-level limit check for check() — cascades through ancestor chain.
   */
  async function checkMultiLevelLimitsForCheck(
    entitlement: string,
    chain: AncestorChainEntry[],
    reasons: DenialReason[],
    meta: DenialMeta,
  ): Promise<void> {
    for (const entry of chain) {
      const sub = await subscriptionStore!.get(entry.type, entry.id);
      if (!sub) continue;

      const levelDefault = accessDef.defaultPlans?.[entry.type] ?? accessDef.defaultPlan;
      const planId = resolveEffectivePlan(sub, accessDef.plans, levelDefault);
      if (!planId) continue;

      const limitKeys = accessDef._entitlementToLimitKeys[entitlement];
      const planDef = accessDef.plans?.[planId];
      if (!planDef?.limits || !limitKeys?.some((k) => k in planDef.limits!)) continue;

      const levelOverrides = overrideStore ? await overrideStore.get(entry.type, entry.id) : null;

      const walletStates = await resolveAllLimitStates(
        entitlement,
        { type: entry.type, id: entry.id },
        accessDef,
        subscriptionStore!,
        walletStore!,
        planVersionStore,
        levelOverrides,
      );
      checkSingleLevelLimitsForCheck(walletStates, reasons, meta);
      if (reasons.includes('limit_reached')) return; // First blocking level stops check
    }
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
    const resolvedOrg = orgResolver ? await orgResolver(resource) : null;

    // Fetch overrides once
    const overrides =
      resolvedOrg && overrideStore
        ? await overrideStore.get(resolvedOrg.type, resolvedOrg.id)
        : null;

    // Build ancestor chain once for multi-level resolution
    const chain = resolvedOrg ? await resolveAncestorChain(resolvedOrg) : null;

    // Layer 1: Feature flags
    if (entDef.flags?.length && flagStore && orgResolver) {
      if (resolvedOrg) {
        const disabledFlags: string[] = [];
        if (chain) {
          // Multi-level: deepest wins
          for (const flag of entDef.flags) {
            if (!resolveMultiLevelFlag(flag, chain)) disabledFlags.push(flag);
          }
        } else {
          // Single-level
          for (const flag of entDef.flags) {
            if (!flagStore.getFlag(resolvedOrg.type, resolvedOrg.id, flag)) {
              disabledFlags.push(flag);
            }
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
        if (effectiveRole) {
          const checkEntEntityType = entitlement.substring(0, entitlement.indexOf(':'));
          let roleToCheck = effectiveRole;
          if (resource.type !== checkEntEntityType) {
            const inherited = resolveInheritedRole(
              resource.type,
              effectiveRole,
              checkEntEntityType,
              accessDef,
            );
            if (inherited) roleToCheck = inherited;
            else roleToCheck = ''; // Force mismatch
          }
          hasRole = entDef.roles.includes(roleToCheck);
        }
      }
      if (!hasRole) {
        reasons.push('role_required');
        meta.requiredRoles = [...entDef.roles];
      }
    }

    // Layer 3: Plan features check
    if (accessDef._planGatedEntitlements.has(entitlement) && subscriptionStore && orgResolver) {
      let planDenied = false;

      if (!resolvedOrg) {
        planDenied = true;
      } else if (chain) {
        // Multi-level: check features across ancestor chain (inherit/local)
        const hasFeature = await resolveMultiLevelFeature(entitlement, chain);
        if (!hasFeature) planDenied = true;
      } else {
        const subscription = await subscriptionStore.get(resolvedOrg.type, resolvedOrg.id);
        const effectivePlanId = resolveEffectivePlan(
          subscription,
          accessDef.plans,
          accessDef.defaultPlan,
        );
        if (!effectivePlanId) {
          planDenied = true;
        } else {
          const hasFeature = await resolveEffectiveFeatures(
            resolvedOrg,
            entitlement,
            effectivePlanId,
            accessDef,
            subscriptionStore,
            planVersionStore,
            overrides,
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
    if (checkLimitKeys?.length && walletStore && subscriptionStore && resolvedOrg) {
      try {
        if (chain) {
          // Multi-level: check limits at all ancestor levels
          await checkMultiLevelLimitsForCheck(entitlement, chain, reasons, meta);
        } else {
          // Single-level: existing behavior
          checkSingleLevelLimitsForCheck(
            await resolveAllLimitStates(
              entitlement,
              resolvedOrg,
              accessDef,
              subscriptionStore,
              walletStore,
              planVersionStore,
              overrides,
            ),
            reasons,
            meta,
          );
        }
      } catch (error) {
        if (!cloudFailMode) throw error;
        meta.cloudError = true;
        if (cloudFailMode !== 'open') {
          // 'closed' and 'cached' (when cache miss) both deny
          reasons.push('limit_reached');
        }
        // 'open' — skip, no denial reason added
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
   *
   * With multi-level tenancy (ancestorResolver + tenantLevel), consumption cascades
   * to all ancestor levels. Lock ordering: root-to-leaf (prevents deadlocks).
   */
  async function canAndConsume(
    entitlement: string,
    resource?: ResourceRef,
    amount = 1,
  ): Promise<boolean> {
    // Resolve org once for all layers
    const resolvedOrg = orgResolver ? await orgResolver(resource) : null;

    // Fetch overrides once
    const overrides =
      resolvedOrg && overrideStore
        ? await overrideStore.get(resolvedOrg.type, resolvedOrg.id)
        : null;

    // Build ancestor chain once for multi-level resolution (Layers 1-3)
    const ancestorChain = resolvedOrg ? await resolveAncestorChain(resolvedOrg) : null;

    // Run Layers 1-3 (auth, flags, roles, plan features — skips limit layer)
    if (!(await checkLayers1to3(entitlement, resource, resolvedOrg, overrides, ancestorChain)))
      return false;

    // If no wallet/plan infrastructure, just return true (no limit to enforce)
    if (!walletStore || !subscriptionStore || !orgResolver) return true;

    // Check if this entitlement has limits
    const limitKeys = accessDef._entitlementToLimitKeys[entitlement];
    if (!limitKeys?.length) return true; // No limits on this entitlement

    if (!resolvedOrg) return false;

    // Build consumption chain: root-to-leaf ordering for lock ordering.
    // Each entry is { resourceType, resourceId, subscription, planId, overrides }.
    const chain = await buildConsumptionChain(resolvedOrg, entitlement);

    if (!chain.length) return false; // No valid plan at any level

    try {
      // Track all consumed entries across all levels for rollback
      const allConsumed: Array<{
        resourceType: string;
        resourceId: string;
        key: string;
        periodStart: Date;
        periodEnd: Date;
      }> = [];

      // Consume root-to-leaf (lock ordering: root first)
      for (const entry of chain) {
        const limitsToConsume = await resolveAllLimitConsumptions(
          { type: entry.resourceType, id: entry.resourceId },
          entitlement,
          entry.planId,
          accessDef,
          subscriptionStore,
          walletStore,
          entry.subscription,
          planVersionStore,
          entry.overrides,
        );

        for (const lc of limitsToConsume) {
          if (lc.effectiveMax === -1) continue; // Unlimited — skip
          if (lc.effectiveMax === 0) {
            await rollbackCascadedConsumptions(allConsumed, walletStore, amount);
            return false;
          }

          let consumeMax = lc.effectiveMax;
          if (lc.hasOverage) {
            if (lc.overageCap !== undefined) {
              const currentConsumed = await walletStore.getConsumption(
                entry.resourceType,
                entry.resourceId,
                lc.walletKey,
                lc.periodStart,
                lc.periodEnd,
              );
              const overageUnits = Math.max(0, currentConsumed + amount - lc.effectiveMax);
              const overageCost = (overageUnits * (lc.overageAmount ?? 0)) / (lc.overagePer ?? 1);
              if (overageCost > lc.overageCap) {
                await rollbackCascadedConsumptions(allConsumed, walletStore, amount);
                return false;
              }
            }
            consumeMax = Number.MAX_SAFE_INTEGER;
          }

          const result = await walletStore.consume(
            entry.resourceType,
            entry.resourceId,
            lc.walletKey,
            lc.periodStart,
            lc.periodEnd,
            consumeMax,
            amount,
          );

          if (!result.success) {
            await rollbackCascadedConsumptions(allConsumed, walletStore, amount);
            return false;
          }

          allConsumed.push({
            resourceType: entry.resourceType,
            resourceId: entry.resourceId,
            key: lc.walletKey,
            periodStart: lc.periodStart,
            periodEnd: lc.periodEnd,
          });
        }
      }

      return true;
    } catch (error) {
      if (!cloudFailMode) throw error;
      return cloudFailMode === 'open';
    }
  }

  /**
   * Build the ordered consumption chain (root-to-leaf) for cascaded wallet operations.
   * Each entry represents a tenant level with a valid subscription and plan.
   */
  async function buildConsumptionChain(
    currentOrg: { type: string; id: string },
    entitlement: string,
  ): Promise<
    Array<{
      resourceType: string;
      resourceId: string;
      subscription: Subscription;
      planId: string;
      overrides: TenantOverrides | null;
    }>
  > {
    if (!subscriptionStore) return [];

    const chain: Array<{
      resourceType: string;
      resourceId: string;
      subscription: Subscription;
      planId: string;
      overrides: TenantOverrides | null;
    }> = [];

    // If multi-level, resolve ancestors (root-to-leaf order)
    if (ancestorResolver && tenantLevel) {
      const ancestors = await ancestorResolver(tenantLevel, currentOrg.id);
      // ancestors are child-to-root (by depth ascending), reverse for root-to-leaf
      const rootToLeaf = [...ancestors].reverse();

      for (const ancestor of rootToLeaf) {
        const entry = await resolveChainEntry(ancestor.type, ancestor.id, entitlement);
        if (entry) chain.push(entry);
      }
    }

    // Add current level (leaf)
    const currentEntry = await resolveChainEntry(currentOrg.type, currentOrg.id, entitlement);
    if (currentEntry) chain.push(currentEntry);

    return chain;
  }

  /**
   * Resolve a single chain entry: subscription, plan, and overrides for a resource.
   * Returns null if the resource has no valid subscription or plan with limits for the entitlement.
   * Uses level-specific defaultPlans when available, falling back to defaultPlan for single-level.
   */
  async function resolveChainEntry(
    resourceType: string,
    resourceId: string,
    entitlement: string,
  ): Promise<{
    resourceType: string;
    resourceId: string;
    subscription: Subscription;
    planId: string;
    overrides: TenantOverrides | null;
  } | null> {
    if (!subscriptionStore) return null;

    const subscription = await subscriptionStore.get(resourceType, resourceId);
    if (!subscription) return null;

    // Use level-specific default plan when available (multi-level), else global default
    const defaultPlan =
      (resourceType && accessDef.defaultPlans?.[resourceType]) ?? accessDef.defaultPlan;
    const planId = resolveEffectivePlan(subscription, accessDef.plans, defaultPlan);
    if (!planId) return null;

    // Check if this plan has limits for the entitlement
    const limitKeys = accessDef._entitlementToLimitKeys[entitlement];
    const planDef = accessDef.plans?.[planId];
    if (!planDef?.limits || !limitKeys?.some((k) => k in planDef.limits!)) return null;

    const tenantOverrides = overrideStore
      ? await overrideStore.get(resourceType, resourceId)
      : null;

    return { resourceType, resourceId, subscription, planId, overrides: tenantOverrides };
  }

  // ==========================================================================
  // unconsume() — rollback
  // ==========================================================================

  async function unconsume(entitlement: string, resource?: ResourceRef, amount = 1): Promise<void> {
    if (!walletStore || !subscriptionStore || !orgResolver) return;

    const limitKeys = accessDef._entitlementToLimitKeys[entitlement];
    if (!limitKeys?.length) return;

    const resolvedOrg = await orgResolver(resource);
    if (!resolvedOrg) return;

    // Build the same consumption chain as canAndConsume (root-to-leaf)
    const chain = await buildConsumptionChain(resolvedOrg, entitlement);

    // Unconsume from all levels in the chain
    for (const entry of chain) {
      const limitsToUnconsume = await resolveAllLimitConsumptions(
        { type: entry.resourceType, id: entry.resourceId },
        entitlement,
        entry.planId,
        accessDef,
        subscriptionStore,
        walletStore,
        entry.subscription,
        planVersionStore,
        entry.overrides,
      );

      for (const lc of limitsToUnconsume) {
        if (lc.effectiveMax === -1) continue; // Unlimited — no wallet entry
        await walletStore.unconsume(
          entry.resourceType,
          entry.resourceId,
          lc.walletKey,
          lc.periodStart,
          lc.periodEnd,
          amount,
        );
      }
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
 * Check if the entitlement is in the effective features (base plan + add-ons + overrides).
 * When a planVersionStore is provided and the tenant has a specific version,
 * uses the versioned snapshot's features instead of the current config.
 */
async function resolveEffectiveFeatures(
  org: { type: string; id: string },
  entitlement: string,
  effectivePlanId: string,
  accessDef: AccessDefinition,
  subscriptionStore: SubscriptionStore,
  planVersionStore?: PlanVersionStore,
  overrides?: TenantOverrides | null,
): Promise<boolean> {
  // Check if tenant has a versioned snapshot to use
  if (planVersionStore) {
    const tenantVersion = await planVersionStore.getTenantVersion(
      org.type,
      org.id,
      effectivePlanId,
    );
    if (tenantVersion !== null) {
      const versionInfo = await planVersionStore.getVersion(effectivePlanId, tenantVersion);
      if (versionInfo) {
        // Use versioned snapshot features instead of current config
        const snapshotFeatures = versionInfo.snapshot.features;
        if (snapshotFeatures.includes(entitlement)) return true;

        // Check add-ons (add-ons are not versioned — they use current config)
        const addOns = await subscriptionStore.getAddOns?.(org.type, org.id);
        if (addOns) {
          for (const addOnId of addOns) {
            const addOnDef = accessDef.plans?.[addOnId];
            if (addOnDef?.features?.includes(entitlement)) return true;
          }
        }

        // Check overrides (overrides apply regardless of versioning)
        if (overrides?.features?.includes(entitlement)) return true;

        return false;
      }
    }
  }

  // Fallback to current config (no version store, or tenant not on a specific version)
  const planDef = accessDef.plans?.[effectivePlanId];
  if (planDef?.features?.includes(entitlement)) return true;

  // Check add-ons
  const addOns = await subscriptionStore.getAddOns?.(org.type, org.id);
  if (addOns) {
    for (const addOnId of addOns) {
      const addOnDef = accessDef.plans?.[addOnId];
      if (addOnDef?.features?.includes(entitlement)) return true;
    }
  }

  // Check overrides
  if (overrides?.features?.includes(entitlement)) return true;

  return false;
}

interface LimitState {
  key: string;
  max: number;
  consumed: number;
  /** Whether this limit has overage billing configured */
  hasOverage: boolean;
  /** Overage cap — when reached, hard block */
  overageCap?: number;
  /** Overage config for billing computation */
  overageAmount?: number;
  overagePer?: number;
}

/**
 * Resolve all limit states for an entitlement.
 * Returns states for ALL limits that gate this entitlement.
 * When a planVersionStore is provided and the tenant has a specific version,
 * uses the versioned snapshot's limits instead of the current config.
 */
async function resolveAllLimitStates(
  entitlement: string,
  org: { type: string; id: string },
  accessDef: AccessDefinition,
  subscriptionStore: SubscriptionStore,
  walletStore: WalletStore,
  planVersionStore?: PlanVersionStore,
  overrides?: TenantOverrides | null,
): Promise<LimitState[]> {
  const subscription = await subscriptionStore.get(org.type, org.id);
  const effectivePlanId = resolveEffectivePlan(
    subscription,
    accessDef.plans,
    accessDef.defaultPlan,
  );
  if (!effectivePlanId || !subscription) return [];

  const limitKeys = accessDef._entitlementToLimitKeys[entitlement];
  if (!limitKeys?.length) return [];

  // Resolve versioned limits if available
  let versionedLimits: Record<string, unknown> | null = null;
  if (planVersionStore) {
    const tenantVersion = await planVersionStore.getTenantVersion(
      org.type,
      org.id,
      effectivePlanId,
    );
    if (tenantVersion !== null) {
      const versionInfo = await planVersionStore.getVersion(effectivePlanId, tenantVersion);
      if (versionInfo) {
        versionedLimits = versionInfo.snapshot.limits;
      }
    }
  }

  const states: LimitState[] = [];

  for (const limitKey of limitKeys) {
    // Use versioned limits if available, otherwise fall back to current config
    let limitDef:
      | { max: number; gates: string; per?: BillingPeriod; scope?: string; overage?: OverageConfig }
      | undefined;

    if (versionedLimits && limitKey in versionedLimits) {
      limitDef = versionedLimits[limitKey] as typeof limitDef;
    } else {
      const planDef = accessDef.plans?.[effectivePlanId];
      limitDef = planDef?.limits?.[limitKey];
    }

    if (!limitDef) continue;

    const effectiveMax = computeEffectiveLimit(
      limitDef.max,
      limitKey,
      org,
      subscription,
      accessDef,
      subscriptionStore,
      overrides,
    );

    const resolvedMax = await effectiveMax;

    const hasOverage = !!limitDef.overage;

    if (resolvedMax === -1) {
      states.push({ key: limitKey, max: -1, consumed: 0, hasOverage });
      continue;
    }

    // Resolve wallet key and billing period
    const walletKey = limitKey;
    const period = limitDef.per
      ? calculateBillingPeriod(subscription.startedAt, limitDef.per)
      : { periodStart: subscription.startedAt, periodEnd: new Date('9999-12-31T23:59:59Z') };

    const consumed = await walletStore.getConsumption(
      org.type,
      org.id,
      walletKey,
      period.periodStart,
      period.periodEnd,
    );

    states.push({
      key: limitKey,
      max: resolvedMax,
      consumed,
      hasOverage,
      ...(limitDef.overage
        ? {
            overageCap: limitDef.overage.cap,
            overageAmount: limitDef.overage.amount,
            overagePer: limitDef.overage.per,
          }
        : {}),
    });
  }

  return states;
}

interface LimitConsumption {
  walletKey: string;
  periodStart: Date;
  periodEnd: Date;
  effectiveMax: number;
  /** Whether this limit has overage billing configured */
  hasOverage: boolean;
  overageCap?: number;
  overageAmount?: number;
  overagePer?: number;
}

/**
 * Resolve all limits for consumption (canAndConsume / unconsume).
 * When a planVersionStore is provided and the tenant has a specific version,
 * uses the versioned snapshot's limits instead of the current config.
 */
async function resolveAllLimitConsumptions(
  org: { type: string; id: string },
  entitlement: string,
  effectivePlanId: string,
  accessDef: AccessDefinition,
  subscriptionStore: SubscriptionStore,
  _walletStore: WalletStore,
  subscription: Subscription,
  planVersionStore?: PlanVersionStore,
  overrides?: TenantOverrides | null,
): Promise<LimitConsumption[]> {
  const limitKeys = accessDef._entitlementToLimitKeys[entitlement];
  if (!limitKeys?.length) return [];

  // Resolve versioned limits if available
  let versionedLimits: Record<string, unknown> | null = null;
  if (planVersionStore) {
    const tenantVersion = await planVersionStore.getTenantVersion(
      org.type,
      org.id,
      effectivePlanId,
    );
    if (tenantVersion !== null) {
      const versionInfo = await planVersionStore.getVersion(effectivePlanId, tenantVersion);
      if (versionInfo) {
        versionedLimits = versionInfo.snapshot.limits;
      }
    }
  }

  const consumptions: LimitConsumption[] = [];

  for (const limitKey of limitKeys) {
    // Use versioned limits if available, otherwise fall back to current config
    let limitDef:
      | { max: number; gates: string; per?: BillingPeriod; scope?: string; overage?: OverageConfig }
      | undefined;

    if (versionedLimits && limitKey in versionedLimits) {
      limitDef = versionedLimits[limitKey] as typeof limitDef;
    } else {
      const planDef = accessDef.plans?.[effectivePlanId];
      limitDef = planDef?.limits?.[limitKey];
    }

    if (!limitDef) continue;

    const effectiveMax = await computeEffectiveLimit(
      limitDef.max,
      limitKey,
      org,
      subscription,
      accessDef,
      subscriptionStore,
      overrides,
    );

    const walletKey = limitKey;
    const period = limitDef.per
      ? calculateBillingPeriod(subscription.startedAt, limitDef.per)
      : { periodStart: subscription.startedAt, periodEnd: new Date('9999-12-31T23:59:59Z') };

    consumptions.push({
      walletKey,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      effectiveMax,
      hasOverage: !!limitDef.overage,
      ...(limitDef.overage
        ? {
            overageCap: limitDef.overage.cap,
            overageAmount: limitDef.overage.amount,
            overagePer: limitDef.overage.per,
          }
        : {}),
    });
  }

  return consumptions;
}

/**
 * Compute effective max limit: base + add-ons + overrides.
 *
 * Override modes:
 * - `add: N` — additive on top of base + add-ons
 * - `max: N` — hard cap replacing computed total
 * - Both set — `max` takes precedence
 */
async function computeEffectiveLimit(
  basePlanMax: number,
  limitKey: string,
  org: { type: string; id: string },
  subscription: Subscription,
  accessDef: AccessDefinition,
  subscriptionStore: SubscriptionStore,
  overrides?: TenantOverrides | null,
): Promise<number> {
  let effectiveMax = basePlanMax;

  // Add add-on limits
  const addOns = await subscriptionStore.getAddOns?.(org.type, org.id);
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

  // Apply old-style per-customer overrides (from Subscription.overrides — Phase 2 compat)
  const oldOverride = subscription.overrides[limitKey];
  if (oldOverride) {
    effectiveMax = Math.max(effectiveMax, oldOverride.max);
  }

  // Apply new-style overrides from OverrideStore
  const limitOverride = overrides?.limits?.[limitKey];
  if (limitOverride) {
    if (limitOverride.max !== undefined) {
      // max takes precedence — hard cap replacing computed total
      effectiveMax = limitOverride.max;
    } else if (limitOverride.add !== undefined) {
      // add — additive on top of base + add-ons
      if (effectiveMax !== -1) {
        effectiveMax = Math.max(0, effectiveMax + limitOverride.add);
      }
    }
  }

  return effectiveMax;
}

/**
 * Rollback previously consumed wallet entries across multiple tenants
 * (for all-or-nothing cascaded canAndConsume).
 * Best-effort: individual unconsume failures are swallowed to ensure
 * remaining entries are still attempted.
 */
async function rollbackCascadedConsumptions(
  consumed: Array<{
    resourceType: string;
    resourceId: string;
    key: string;
    periodStart: Date;
    periodEnd: Date;
  }>,
  walletStore: WalletStore,
  amount: number,
): Promise<void> {
  for (const c of consumed) {
    try {
      await walletStore.unconsume(
        c.resourceType,
        c.resourceId,
        c.key,
        c.periodStart,
        c.periodEnd,
        amount,
      );
    } catch {
      // Best-effort rollback — log would be nice but we don't have a logger here.
      // The alternative (letting one failure orphan the rest) is worse.
    }
  }
}
