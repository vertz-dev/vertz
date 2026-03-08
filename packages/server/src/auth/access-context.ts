/**
 * Access Context — the resolution engine for can/check/authorize/canAll.
 *
 * Evaluates access rules against the defineAccess() config,
 * closure table, and role assignments using 5-layer resolution.
 *
 * Layers (cheapest-first for can(), all-layers for check()):
 * 1. Feature flags (stubbed — always pass)
 * 2. RBAC (effective role check)
 * 3. Hierarchy (closure table path check)
 * 4. Plan check (stubbed — always pass)
 * 5. Wallet check (stubbed — always pass)
 */

import { AuthorizationError } from './access';
import type { ClosureStore } from './closure-store';
import type {
  AccessCheckResult,
  AccessDefinition,
  DenialMeta,
  DenialReason,
} from './define-access';
import type { RoleAssignmentStore } from './role-assignment-store';

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
}

export interface AccessContext {
  can(entitlement: string, resource?: ResourceRef): Promise<boolean>;
  check(entitlement: string, resource?: ResourceRef): Promise<AccessCheckResult>;
  authorize(entitlement: string, resource?: ResourceRef): Promise<void>;
  canAll(
    checks: Array<{ entitlement: string; resource?: ResourceRef }>,
  ): Promise<Map<string, boolean>>;
}

const MAX_BULK_CHECKS = 100;

// ============================================================================
// createAccessContext()
// ============================================================================

export function createAccessContext(config: AccessContextConfig): AccessContext {
  const { userId, accessDef, closureStore, roleStore } = config;

  // ==========================================================================
  // can() — short-circuits cheapest-first
  // ==========================================================================

  async function can(entitlement: string, resource?: ResourceRef): Promise<boolean> {
    // Unauthenticated user — deny immediately
    if (!userId) return false;

    const entDef = accessDef.entitlements[entitlement];
    if (!entDef) return false; // Unknown entitlement — deny

    // Layer 1: Feature flags (stub — always pass)
    // if (entDef.flags?.length) { ... }

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

    // Layer 4: Plan check (stub — always pass)
    // if (entDef.plans?.length) { ... }

    // Layer 5: Wallet check (stub — always pass)

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

    // Layer 1: Feature flags (stub)
    // if (entDef.flags?.length) { ... }

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

    // Layer 4: Plan (stub)
    // if (entDef.plans?.length) { reasons.push('plan_required'); meta.requiredPlans = [...entDef.plans]; }

    // Layer 5: Wallet (stub)

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

  return { can, check, authorize, canAll };
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
