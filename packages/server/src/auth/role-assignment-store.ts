/**
 * InMemoryRoleAssignmentStore — (userId, resourceType, resourceId, role) tuples.
 *
 * Supports role inheritance via closure table: inherited roles are additive,
 * most permissive role wins.
 */

import type { ClosureStore } from './closure-store';
import type { AccessDefinition } from './define-access';

// ============================================================================
// Types
// ============================================================================

export interface RoleAssignment {
  userId: string;
  resourceType: string;
  resourceId: string;
  role: string;
}

export interface RoleAssignmentStore {
  assign(userId: string, resourceType: string, resourceId: string, role: string): void;
  revoke(userId: string, resourceType: string, resourceId: string, role: string): void;
  getRoles(userId: string, resourceType: string, resourceId: string): string[];
  getEffectiveRole(
    userId: string,
    resourceType: string,
    resourceId: string,
    accessDef: AccessDefinition,
    closureStore: ClosureStore,
  ): string | null;
  dispose(): void;
}

// ============================================================================
// InMemoryRoleAssignmentStore
// ============================================================================

export class InMemoryRoleAssignmentStore implements RoleAssignmentStore {
  private assignments: RoleAssignment[] = [];

  assign(userId: string, resourceType: string, resourceId: string, role: string): void {
    // Deduplicate
    const exists = this.assignments.some(
      (a) =>
        a.userId === userId &&
        a.resourceType === resourceType &&
        a.resourceId === resourceId &&
        a.role === role,
    );
    if (!exists) {
      this.assignments.push({ userId, resourceType, resourceId, role });
    }
  }

  revoke(userId: string, resourceType: string, resourceId: string, role: string): void {
    this.assignments = this.assignments.filter(
      (a) =>
        !(
          a.userId === userId &&
          a.resourceType === resourceType &&
          a.resourceId === resourceId &&
          a.role === role
        ),
    );
  }

  getRoles(userId: string, resourceType: string, resourceId: string): string[] {
    return this.assignments
      .filter(
        (a) =>
          a.userId === userId && a.resourceType === resourceType && a.resourceId === resourceId,
      )
      .map((a) => a.role);
  }

  /**
   * Compute the effective role for a user on a resource.
   * Considers direct assignments + inherited roles from ancestors.
   * Most permissive role wins (additive model).
   */
  getEffectiveRole(
    userId: string,
    resourceType: string,
    resourceId: string,
    accessDef: AccessDefinition,
    closureStore: ClosureStore,
  ): string | null {
    const rolesForType = accessDef.roles[resourceType];
    if (!rolesForType || rolesForType.length === 0) return null;

    // Collect all candidate roles (direct + inherited)
    const candidateRoles: string[] = [];

    // 1. Direct roles on this resource
    const directRoles = this.getRoles(userId, resourceType, resourceId);
    candidateRoles.push(...directRoles);

    // 2. Inherited roles from ancestors
    const ancestors = closureStore.getAncestors(resourceType, resourceId);
    for (const ancestor of ancestors) {
      if (ancestor.depth === 0) continue; // Skip self-reference

      const ancestorRoles = this.getRoles(userId, ancestor.type, ancestor.id);
      for (const ancestorRole of ancestorRoles) {
        // Walk the inheritance chain from ancestor type down to target type
        const inheritedRole = resolveInheritedRole(
          ancestor.type,
          ancestorRole,
          resourceType,
          accessDef,
        );
        if (inheritedRole) {
          candidateRoles.push(inheritedRole);
        }
      }
    }

    if (candidateRoles.length === 0) return null;

    // Most permissive role wins: earlier in the roles array = more permissive
    const roleOrder = [...rolesForType];
    let bestIndex = roleOrder.length;
    for (const role of candidateRoles) {
      const idx = roleOrder.indexOf(role);
      if (idx !== -1 && idx < bestIndex) {
        bestIndex = idx;
      }
    }

    return bestIndex < roleOrder.length ? roleOrder[bestIndex] : null;
  }

  dispose(): void {
    this.assignments = [];
  }
}

// ============================================================================
// Inheritance Resolution
// ============================================================================

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
