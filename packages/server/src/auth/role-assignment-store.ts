/**
 * InMemoryRoleAssignmentStore — (userId, resourceType, resourceId, role) tuples.
 *
 * Supports role inheritance via closure table: inherited roles are additive,
 * most permissive role wins.
 */

import type { ClosureStore } from './closure-store';
import type { AccessDefinition } from './define-access';
import { resolveInheritedRole } from './resolve-inherited-role';

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
  assign(userId: string, resourceType: string, resourceId: string, role: string): Promise<void>;
  revoke(userId: string, resourceType: string, resourceId: string, role: string): Promise<void>;
  getRoles(userId: string, resourceType: string, resourceId: string): Promise<string[]>;
  getRolesForUser(userId: string): Promise<RoleAssignment[]>;
  getEffectiveRole(
    userId: string,
    resourceType: string,
    resourceId: string,
    accessDef: AccessDefinition,
    closureStore: ClosureStore,
  ): Promise<string | null>;
  dispose(): void;
}

// ============================================================================
// InMemoryRoleAssignmentStore
// ============================================================================

export class InMemoryRoleAssignmentStore implements RoleAssignmentStore {
  private assignments: RoleAssignment[] = [];

  async assign(
    userId: string,
    resourceType: string,
    resourceId: string,
    role: string,
  ): Promise<void> {
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

  async revoke(
    userId: string,
    resourceType: string,
    resourceId: string,
    role: string,
  ): Promise<void> {
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

  async getRoles(userId: string, resourceType: string, resourceId: string): Promise<string[]> {
    return this.assignments
      .filter(
        (a) =>
          a.userId === userId && a.resourceType === resourceType && a.resourceId === resourceId,
      )
      .map((a) => a.role);
  }

  async getRolesForUser(userId: string): Promise<RoleAssignment[]> {
    return this.assignments.filter((a) => a.userId === userId);
  }

  /**
   * Compute the effective role for a user on a resource.
   * Considers direct assignments + inherited roles from ancestors.
   * Most permissive role wins (additive model).
   */
  async getEffectiveRole(
    userId: string,
    resourceType: string,
    resourceId: string,
    accessDef: AccessDefinition,
    closureStore: ClosureStore,
  ): Promise<string | null> {
    const rolesForType = accessDef.roles[resourceType];
    if (!rolesForType || rolesForType.length === 0) return null;

    // Collect all candidate roles (direct + inherited)
    const candidateRoles: string[] = [];

    // 1. Direct roles on this resource
    const directRoles = await this.getRoles(userId, resourceType, resourceId);
    candidateRoles.push(...directRoles);

    // 2. Inherited roles from ancestors
    const ancestors = await closureStore.getAncestors(resourceType, resourceId);
    for (const ancestor of ancestors) {
      if (ancestor.depth === 0) continue; // Skip self-reference

      const ancestorRoles = await this.getRoles(userId, ancestor.type, ancestor.id);
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
