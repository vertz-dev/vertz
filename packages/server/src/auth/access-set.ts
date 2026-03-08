/**
 * Access Set — computes global entitlement snapshots for a user.
 *
 * Unlike AccessContext.check() which evaluates entitlements per-resource,
 * computeAccessSet() resolves ALL entitlements globally by enumerating
 * the user's roles across the entire resource hierarchy. The result is
 * embedded in the JWT and delivered to the client for advisory UI checks.
 */

import type { ClosureStore } from './closure-store';
import type { AccessDefinition, DenialMeta, DenialReason } from './define-access';
import type { RoleAssignmentStore } from './role-assignment-store';

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
}

// ============================================================================
// computeAccessSet()
// ============================================================================

export async function computeAccessSet(config: ComputeAccessSetConfig): Promise<AccessSet> {
  const { userId, accessDef, roleStore, closureStore, plan } = config;
  const entitlements: Record<string, AccessCheckData> = {};

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
  const assignments = roleStore.getRolesForUser(userId);

  // For each assignment, expand via descendants to find effective roles
  // Collect all roles per resource type that the user effectively has
  const effectiveRolesByType = new Map<string, Set<string>>();

  for (const assignment of assignments) {
    // Direct role
    addRole(effectiveRolesByType, assignment.resourceType, assignment.role);

    // Inherited roles on descendants
    const descendants = closureStore.getDescendants(assignment.resourceType, assignment.resourceId);
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

  return {
    entitlements,
    flags: {},
    plan: plan ?? null,
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
      entitlements[name] = { allowed: true };
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
