/**
 * Access Set — computes global entitlement snapshots for a user.
 *
 * Unlike AccessContext.check() which evaluates entitlements per-resource,
 * computeAccessSet() resolves ALL entitlements globally by enumerating
 * the user's roles across the entire resource hierarchy. The result is
 * embedded in the JWT and delivered to the client for advisory UI checks.
 */

import type { ResourceRef } from './access-context';
import { calculateBillingPeriod } from './billing-period';
import type { ClosureStore } from './closure-store';
import type { AccessDefinition, DenialMeta, DenialReason } from './define-access';
import type { FlagStore } from './flag-store';
import { resolveInheritedRole } from './resolve-inherited-role';
import type { RoleAssignmentStore } from './role-assignment-store';
import { resolveEffectivePlan, type SubscriptionStore } from './subscription-store';
import type { WalletStore } from './wallet-store';

// ============================================================================
// Types
// ============================================================================

export interface AccessCheckData {
  allowed: boolean;
  reasons: DenialReason[];
  reason?: DenialReason;
  meta?: DenialMeta;
}

export interface AccessSet {
  entitlements: Record<string, AccessCheckData>;
  flags: Record<string, boolean>;
  /** @deprecated Use `plans` for multi-level. Kept for backward compat — returns deepest level's plan. */
  plan: string | null;
  /** Plan per billing level. Keys are entity names. */
  plans: Record<string, string | null>;
  computedAt: string;
}

/** An entry in the ancestor chain from child to root. */
export interface AncestorChainEntry {
  type: string;
  id: string;
  depth: number;
}

export interface ComputeAccessSetConfig {
  userId: string | null;
  accessDef: AccessDefinition;
  roleStore: RoleAssignmentStore;
  closureStore: ClosureStore;
  /** Flag store — for feature flag state in access set */
  flagStore?: FlagStore;
  /** Subscription store — for limit info in access set */
  subscriptionStore?: SubscriptionStore;
  /** Wallet store — for consumption info in access set */
  walletStore?: WalletStore;
  /** Org resolver — for plan/wallet lookups */
  orgResolver?: (resource?: ResourceRef) => Promise<string | null>;
  /** Tenant ID — direct tenant ID for global access set (bypass orgResolver) */
  tenantId?: string | null;
  /** Tenant level — entity type of tenantId (e.g., 'project'). Required for multi-level. */
  tenantLevel?: string;
  /** Resolves the ancestor chain from a tenant. Returns entries from child to root. */
  ancestorResolver?: (tenantLevel: string, tenantId: string) => Promise<AncestorChainEntry[]>;
}

// ============================================================================
// computeAccessSet()
// ============================================================================

export async function computeAccessSet(config: ComputeAccessSetConfig): Promise<AccessSet> {
  const {
    userId,
    accessDef,
    roleStore,
    closureStore,
    flagStore,
    subscriptionStore,
    walletStore,
    tenantId,
  } = config;
  const entitlements: Record<string, AccessCheckData> = {};
  let resolvedPlan: string | null = null;

  // Unauthenticated user — all entitlements denied
  if (!userId) {
    for (const name of Object.keys(accessDef.entitlements)) {
      entitlements[name] = {
        allowed: false,
        reasons: ['not_authenticated'],
        reason: 'not_authenticated',
      };
    }
    return {
      entitlements,
      flags: {},
      plan: null,
      plans: {},
      computedAt: new Date().toISOString(),
    };
  }

  // Collect all roles the user has across the hierarchy
  const assignments = await roleStore.getRolesForUser(userId);

  // For each assignment, expand via descendants to find effective roles
  // Collect all roles per resource type that the user effectively has
  const effectiveRolesByType = new Map<string, Set<string>>();

  for (const assignment of assignments) {
    // Direct role
    addRole(effectiveRolesByType, assignment.resourceType, assignment.role);

    // Inherited roles on descendants
    const descendants = await closureStore.getDescendants(
      assignment.resourceType,
      assignment.resourceId,
    );
    for (const desc of descendants) {
      if (desc.depth === 0) continue; // skip self
      const inheritedRole = resolveInheritedRole(
        assignment.resourceType,
        assignment.role,
        desc.type,
        accessDef,
      );
      if (inheritedRole) {
        addRole(effectiveRolesByType, desc.type, inheritedRole);
      }
    }
  }

  // Flatten all effective roles
  const allRoles = new Set<string>();
  for (const roles of effectiveRolesByType.values()) {
    for (const role of roles) {
      allRoles.add(role);
    }
  }

  // Check each entitlement
  for (const [name, entDef] of Object.entries(accessDef.entitlements)) {
    if (entDef.roles.length === 0) {
      // No role requirement — automatically granted
      entitlements[name] = { allowed: true, reasons: [] };
      continue;
    }

    // Check if user has ANY of the required roles
    const hasRequiredRole = entDef.roles.some((r) => allRoles.has(r));

    if (hasRequiredRole) {
      entitlements[name] = { allowed: true, reasons: [] };
    } else {
      entitlements[name] = {
        allowed: false,
        reasons: ['role_required'],
        reason: 'role_required',
        meta: { requiredRoles: [...entDef.roles] },
      };
    }
  }

  // Populate flags and check flag-gated entitlements
  const resolvedFlags: Record<string, boolean> = {};
  if (flagStore && tenantId) {
    const orgFlags = flagStore.getFlags(tenantId);
    Object.assign(resolvedFlags, orgFlags);

    // Check each entitlement for flag requirements
    for (const [name, entDef] of Object.entries(accessDef.entitlements)) {
      if (entDef.flags?.length) {
        const disabledFlags: string[] = [];
        for (const flag of entDef.flags) {
          if (!flagStore.getFlag(tenantId, flag)) {
            disabledFlags.push(flag);
          }
        }
        if (disabledFlags.length > 0) {
          const entry = entitlements[name];
          const reasons: DenialReason[] = [...entry.reasons];
          if (!reasons.includes('flag_disabled')) reasons.push('flag_disabled');
          entitlements[name] = {
            ...entry,
            allowed: false,
            reasons,
            reason: reasons[0],
            meta: { ...entry.meta, disabledFlags },
          };
        }
      }
    }
  }

  // Enrich with plan/wallet info if stores are available
  const resolvedPlans: Record<string, string | null> = {};
  const isMultiLevel = !!(config.ancestorResolver && config.tenantLevel && tenantId);

  if (subscriptionStore && tenantId) {
    if (isMultiLevel) {
      // Multi-level: resolve plans per billing level via ancestor chain
      const ancestors = await config.ancestorResolver!(config.tenantLevel!, tenantId);
      // Build the full chain: self + ancestors (sorted child → root by depth)
      const chain: AncestorChainEntry[] = [
        { type: config.tenantLevel!, id: tenantId, depth: 0 },
        ...ancestors.sort((a, b) => a.depth - b.depth),
      ];

      // Collect effective features across all levels
      const allEffectiveFeatures = new Set<string>();
      // Track features per level for 'local' resolution
      const featuresByLevel = new Map<string, Set<string>>();

      // Deepest level (smallest depth) is the tenant itself
      let deepestPlan: string | null = null;

      for (const entry of chain) {
        const levelPlans = accessDef._billingLevels[entry.type];
        if (!levelPlans?.length) continue;

        const sub = await subscriptionStore.get(entry.id);
        let planId: string | null = null;
        // Level-specific default avoids resolveEffectivePlan's hardcoded 'free' fallback
        // which could pick up a plan from the wrong level
        const levelDefault = accessDef.defaultPlans?.[entry.type];
        if (sub) {
          planId = resolveEffectivePlan(
            sub,
            accessDef.plans,
            levelDefault ?? accessDef.defaultPlan ?? 'free',
          );
        } else {
          // No subscription — use default plan for this level
          planId = levelDefault ?? null;
        }

        resolvedPlans[entry.type] = planId;

        if (entry.depth === 0) {
          deepestPlan = planId;
        }

        // Collect base plan features
        const levelFeatures = new Set<string>();
        if (planId) {
          const pDef = accessDef.plans?.[planId];
          if (pDef?.features) {
            for (const f of pDef.features) levelFeatures.add(f);
          }
        }

        // Collect add-on features for this level
        const addOns = await subscriptionStore.getAddOns?.(entry.id);
        if (addOns) {
          for (const addOnId of addOns) {
            const addOnDef = accessDef.plans?.[addOnId];
            if (addOnDef?.features) {
              for (const f of addOnDef.features) levelFeatures.add(f);
            }
          }
        }

        if (levelFeatures.size > 0) {
          featuresByLevel.set(entry.type, levelFeatures);
          for (const f of levelFeatures) allEffectiveFeatures.add(f);
        }
      }

      resolvedPlan = deepestPlan;

      // Check plan-gated entitlements with inherit/local resolution
      for (const [name, entDef] of Object.entries(accessDef.entitlements)) {
        if (!accessDef._planGatedEntitlements.has(name)) continue;

        const resolution = entDef.featureResolution ?? 'inherit';
        let hasFeature = false;

        if (resolution === 'inherit') {
          hasFeature = allEffectiveFeatures.has(name);
        } else {
          // 'local': only check deepest level's features
          const deepestType = config.tenantLevel!;
          const deepestFeatures = featuresByLevel.get(deepestType);
          hasFeature = deepestFeatures?.has(name) ?? false;
        }

        if (!hasFeature) {
          const entry = entitlements[name];
          const reasons: DenialReason[] = [...entry.reasons];
          if (!reasons.includes('plan_required')) reasons.push('plan_required');
          const requiredPlans: string[] = [];
          for (const [pName, pDef] of Object.entries(accessDef.plans ?? {})) {
            if (pDef.features?.includes(name)) requiredPlans.push(pName);
          }
          entitlements[name] = {
            ...entry,
            allowed: false,
            reasons,
            reason: reasons[0],
            meta: { ...entry.meta, requiredPlans },
          };
        }
      }

      // Wallet/limit enrichment: use deepest level's subscription for limit checks
      if (walletStore && deepestPlan) {
        const deepestSub = await subscriptionStore.get(tenantId);
        const deepestPlanDef = accessDef.plans?.[deepestPlan];
        if (deepestSub && deepestPlanDef) {
          const deepestAddOns = await subscriptionStore.getAddOns?.(tenantId);
          for (const name of Object.keys(accessDef.entitlements)) {
            const limitKeys = accessDef._entitlementToLimitKeys[name];
            if (!limitKeys?.length) continue;

            const limitKey = limitKeys[0];
            const limitDef = deepestPlanDef.limits?.[limitKey];
            if (!limitDef) continue;

            let effectiveMax = limitDef.max;
            if (deepestAddOns) {
              for (const addOnId of deepestAddOns) {
                const addOnDef = accessDef.plans?.[addOnId];
                const addOnLimit = addOnDef?.limits?.[limitKey];
                if (addOnLimit) {
                  if (effectiveMax === -1) break;
                  effectiveMax += addOnLimit.max;
                }
              }
            }
            const override = deepestSub.overrides[limitKey];
            if (override) effectiveMax = Math.max(effectiveMax, override.max);

            if (effectiveMax === -1) {
              const entry = entitlements[name];
              entitlements[name] = {
                ...entry,
                meta: {
                  ...entry.meta,
                  limit: { key: limitKey, max: -1, consumed: 0, remaining: -1 },
                },
              };
            } else {
              const period = limitDef.per
                ? calculateBillingPeriod(deepestSub.startedAt, limitDef.per)
                : {
                    periodStart: deepestSub.startedAt,
                    periodEnd: new Date('9999-12-31T23:59:59Z'),
                  };
              const consumed = await walletStore.getConsumption(
                tenantId,
                limitKey,
                period.periodStart,
                period.periodEnd,
              );
              const remaining = Math.max(0, effectiveMax - consumed);
              const entry = entitlements[name];

              if (consumed >= effectiveMax) {
                const reasons: DenialReason[] = [...entry.reasons];
                if (!reasons.includes('limit_reached')) reasons.push('limit_reached');
                entitlements[name] = {
                  ...entry,
                  allowed: false,
                  reasons,
                  reason: reasons[0],
                  meta: {
                    ...entry.meta,
                    limit: { key: limitKey, max: effectiveMax, consumed, remaining },
                  },
                };
              } else {
                entitlements[name] = {
                  ...entry,
                  meta: {
                    ...entry.meta,
                    limit: { key: limitKey, max: effectiveMax, consumed, remaining },
                  },
                };
              }
            }
          }
        }
      }
    } else {
      // Single-level: existing behavior
      const subscription = await subscriptionStore.get(tenantId);
      if (subscription) {
        const effectivePlanId = resolveEffectivePlan(
          subscription,
          accessDef.plans,
          accessDef.defaultPlan,
        );
        resolvedPlan = effectivePlanId;
        if (effectivePlanId) {
          const planDef = accessDef.plans?.[effectivePlanId];
          if (planDef) {
            // Compute effective features (base plan + add-ons)
            const effectiveFeatures = new Set<string>(planDef.features ?? []);
            const addOns = await subscriptionStore.getAddOns?.(tenantId);
            if (addOns) {
              for (const addOnId of addOns) {
                const addOnDef = accessDef.plans?.[addOnId];
                if (addOnDef?.features) {
                  for (const f of addOnDef.features) effectiveFeatures.add(f);
                }
              }
            }

            for (const name of Object.keys(accessDef.entitlements)) {
              // Plan check: if entitlement is plan-gated, verify effective features include it
              if (accessDef._planGatedEntitlements.has(name) && !effectiveFeatures.has(name)) {
                const entry = entitlements[name];
                const reasons: DenialReason[] = [...entry.reasons];
                if (!reasons.includes('plan_required')) reasons.push('plan_required');
                // Collect which plans include this entitlement
                const requiredPlans: string[] = [];
                for (const [pName, pDef] of Object.entries(accessDef.plans ?? {})) {
                  if (pDef.features?.includes(name)) requiredPlans.push(pName);
                }
                entitlements[name] = {
                  ...entry,
                  allowed: false,
                  reasons,
                  reason: reasons[0],
                  meta: { ...entry.meta, requiredPlans },
                };
              }

              // Wallet check: add limit info if entitlement has limits
              const limitKeys = accessDef._entitlementToLimitKeys[name];
              if (walletStore && limitKeys?.length) {
                // Use the first limit key for display in access set
                // (multi-limit detail is for real-time checks, not JWT snapshots)
                const limitKey = limitKeys[0];
                const limitDef = planDef.limits?.[limitKey];
                if (limitDef) {
                  // Compute effective max (base + add-ons + overrides)
                  let effectiveMax = limitDef.max;
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
                  const override = subscription.overrides[limitKey];
                  if (override) effectiveMax = Math.max(effectiveMax, override.max);

                  if (effectiveMax === -1) {
                    // Unlimited — no wallet check needed, but report in meta
                    const entry = entitlements[name];
                    entitlements[name] = {
                      ...entry,
                      meta: {
                        ...entry.meta,
                        limit: { key: limitKey, max: -1, consumed: 0, remaining: -1 },
                      },
                    };
                  } else {
                    const period = limitDef.per
                      ? calculateBillingPeriod(subscription.startedAt, limitDef.per)
                      : {
                          periodStart: subscription.startedAt,
                          periodEnd: new Date('9999-12-31T23:59:59Z'),
                        };
                    const consumed = await walletStore.getConsumption(
                      tenantId,
                      limitKey,
                      period.periodStart,
                      period.periodEnd,
                    );
                    const remaining = Math.max(0, effectiveMax - consumed);
                    const entry = entitlements[name];

                    if (consumed >= effectiveMax) {
                      const reasons: DenialReason[] = [...entry.reasons];
                      if (!reasons.includes('limit_reached')) reasons.push('limit_reached');
                      entitlements[name] = {
                        ...entry,
                        allowed: false,
                        reasons,
                        reason: reasons[0],
                        meta: {
                          ...entry.meta,
                          limit: { key: limitKey, max: effectiveMax, consumed, remaining },
                        },
                      };
                    } else {
                      entitlements[name] = {
                        ...entry,
                        meta: {
                          ...entry.meta,
                          limit: { key: limitKey, max: effectiveMax, consumed, remaining },
                        },
                      };
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return {
    entitlements,
    flags: resolvedFlags,
    plan: resolvedPlan,
    plans: resolvedPlans,
    computedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Encoding (for JWT acl claim — sparse format)
// ============================================================================

/** Sparse encoding for JWT. Only includes allowed + denied-with-meta entries. */
export interface EncodedAccessSet {
  entitlements: Record<string, EncodedAccessCheckData>;
  flags: Record<string, boolean>;
  plan: string | null;
  plans: Record<string, string | null>;
  computedAt: string;
}

interface EncodedAccessCheckData {
  allowed: boolean;
  reasons?: DenialReason[];
  reason?: DenialReason;
  meta?: DenialMeta;
}

/**
 * Encode an AccessSet for JWT embedding.
 * Sparse: only includes allowed entitlements and denied entries with meta.
 * Strips requiredRoles and requiredPlans from meta (organizational info).
 */
export function encodeAccessSet(set: AccessSet): EncodedAccessSet {
  const entitlements: Record<string, EncodedAccessCheckData> = {};

  for (const [name, check] of Object.entries(set.entitlements)) {
    if (check.allowed) {
      const entry: EncodedAccessCheckData = { allowed: true };
      // Preserve limit info on allowed entries (for client-side usage display)
      if (check.meta?.limit) {
        entry.meta = { limit: { ...check.meta.limit } };
      }
      entitlements[name] = entry;
    } else if (check.meta && Object.keys(check.meta).length > 0) {
      // Strip organizational meta from JWT
      const strippedMeta: DenialMeta = { ...check.meta };
      delete strippedMeta.requiredRoles;
      delete strippedMeta.requiredPlans;

      const hasRemainingMeta = Object.keys(strippedMeta).length > 0;

      entitlements[name] = {
        allowed: false,
        ...(check.reasons.length > 0 ? { reasons: [...check.reasons] } : {}),
        ...(check.reason ? { reason: check.reason } : {}),
        ...(hasRemainingMeta ? { meta: strippedMeta } : {}),
      };
    }
    // Denied without meta = omitted (sparse)
  }

  return {
    entitlements,
    flags: { ...set.flags },
    plan: set.plan,
    plans: { ...set.plans },
    computedAt: set.computedAt,
  };
}

/**
 * Decode a sparse encoded AccessSet back to full form.
 * Missing entitlements default to denied with 'role_required'.
 */
export function decodeAccessSet(encoded: EncodedAccessSet, accessDef: AccessDefinition): AccessSet {
  const entitlements: Record<string, AccessCheckData> = {};

  // Fill in from encoded data
  for (const [name, check] of Object.entries(encoded.entitlements)) {
    entitlements[name] = {
      allowed: check.allowed,
      reasons: check.reasons ?? [],
      ...(check.reason ? { reason: check.reason } : {}),
      ...(check.meta ? { meta: check.meta } : {}),
    };
  }

  // Fill in missing entitlements as denied
  for (const name of Object.keys(accessDef.entitlements)) {
    if (!(name in entitlements)) {
      entitlements[name] = {
        allowed: false,
        reasons: ['role_required'],
        reason: 'role_required',
      };
    }
  }

  return {
    entitlements,
    flags: { ...encoded.flags },
    plan: encoded.plan,
    plans: { ...(encoded.plans ?? {}) },
    computedAt: encoded.computedAt,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function addRole(map: Map<string, Set<string>>, resourceType: string, role: string): void {
  let roles = map.get(resourceType);
  if (!roles) {
    roles = new Set();
    map.set(resourceType, roles);
  }
  roles.add(role);
}
