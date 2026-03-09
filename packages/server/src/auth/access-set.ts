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
import { type PlanStore, resolveEffectivePlan } from './plan-store';
import type { RoleAssignmentStore } from './role-assignment-store';
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
  plan: string | null;
  computedAt: string;
}

export interface ComputeAccessSetConfig {
  userId: string | null;
  accessDef: AccessDefinition;
  roleStore: RoleAssignmentStore;
  closureStore: ClosureStore;
  plan?: string | null;
  /** Flag store — for feature flag state in access set */
  flagStore?: FlagStore;
  /** Plan store — for limit info in access set */
  planStore?: PlanStore;
  /** Wallet store — for consumption info in access set */
  walletStore?: WalletStore;
  /** Org resolver — for plan/wallet lookups */
  orgResolver?: (resource?: ResourceRef) => Promise<string | null>;
  /** Org ID — direct org ID for global access set (bypass orgResolver) */
  orgId?: string | null;
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
    plan,
    flagStore,
    planStore,
    walletStore,
    orgId,
  } = config;
  const entitlements: Record<string, AccessCheckData> = {};
  let resolvedPlan = plan ?? null;

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
      plan: plan ?? null,
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
  if (flagStore && orgId) {
    const orgFlags = flagStore.getFlags(orgId);
    Object.assign(resolvedFlags, orgFlags);

    // Check each entitlement for flag requirements
    for (const [name, entDef] of Object.entries(accessDef.entitlements)) {
      if (entDef.flags?.length) {
        const disabledFlags: string[] = [];
        for (const flag of entDef.flags) {
          if (!flagStore.getFlag(orgId, flag)) {
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
  if (planStore && orgId) {
    const orgPlan = await planStore.getPlan(orgId);
    if (orgPlan) {
      const effectivePlanId = resolveEffectivePlan(orgPlan, accessDef.plans, accessDef.defaultPlan);
      resolvedPlan = effectivePlanId;
      if (effectivePlanId) {
        const planDef = accessDef.plans?.[effectivePlanId];
        if (planDef) {
          for (const [name, entDef] of Object.entries(accessDef.entitlements)) {
            // Plan check: if entitlement requires plans, verify plan includes it
            if (entDef.plans?.length && !planDef.entitlements.includes(name)) {
              const entry = entitlements[name];
              const reasons: DenialReason[] = [...entry.reasons];
              if (!reasons.includes('plan_required')) reasons.push('plan_required');
              entitlements[name] = {
                ...entry,
                allowed: false,
                reasons,
                reason: reasons[0],
                meta: { ...entry.meta, requiredPlans: [...entDef.plans] },
              };
            }

            // Wallet check: add limit info if entitlement has limits
            if (walletStore && planDef.limits?.[name]) {
              const limitDef = planDef.limits[name];
              const override = orgPlan.overrides[name];
              const effectiveLimit = override ? Math.max(override.max, limitDef.max) : limitDef.max;
              const { periodStart, periodEnd } = calculateBillingPeriod(
                orgPlan.startedAt,
                limitDef.per,
              );
              const consumed = await walletStore.getConsumption(
                orgId,
                name,
                periodStart,
                periodEnd,
              );
              const remaining = Math.max(0, effectiveLimit - consumed);
              const entry = entitlements[name];

              if (consumed >= effectiveLimit) {
                const reasons: DenialReason[] = [...entry.reasons];
                if (!reasons.includes('limit_reached')) reasons.push('limit_reached');
                entitlements[name] = {
                  ...entry,
                  allowed: false,
                  reasons,
                  reason: reasons[0],
                  meta: {
                    ...entry.meta,
                    limit: { max: effectiveLimit, consumed, remaining },
                  },
                };
              } else {
                entitlements[name] = {
                  ...entry,
                  meta: {
                    ...entry.meta,
                    limit: { max: effectiveLimit, consumed, remaining },
                  },
                };
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

/**
 * Walk the inheritance chain from a source resource type down to a target type.
 * Returns the inherited role at the target type, or null if no path exists.
 */
function resolveInheritedRole(
  sourceType: string,
  sourceRole: string,
  targetType: string,
  accessDef: AccessDefinition,
): string | null {
  const hierarchy = accessDef.hierarchy;
  const sourceIdx = hierarchy.indexOf(sourceType);
  const targetIdx = hierarchy.indexOf(targetType);

  if (sourceIdx === -1 || targetIdx === -1 || sourceIdx >= targetIdx) return null;

  let currentRole = sourceRole;
  for (let i = sourceIdx; i < targetIdx; i++) {
    const currentType = hierarchy[i];
    const inheritanceMap = accessDef.inheritance[currentType];
    if (!inheritanceMap || !(currentRole in inheritanceMap)) return null;
    currentRole = inheritanceMap[currentRole];
  }

  return currentRole;
}
