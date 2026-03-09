/**
 * DB-backed RoleAssignmentStore implementation.
 *
 * Stores role assignments in auth_role_assignments table.
 * Uses INSERT ... ON CONFLICT DO NOTHING for idempotent assigns (works on both SQLite and PostgreSQL).
 */

import { sql } from '@vertz/db/sql';
import type { ClosureStore } from './closure-store';
import { type AuthDbClient, assertWrite } from './db-types';
import type { AccessDefinition } from './define-access';
import { resolveInheritedRole } from './resolve-inherited-role';
import type { RoleAssignment, RoleAssignmentStore } from './role-assignment-store';

export class DbRoleAssignmentStore implements RoleAssignmentStore {
  constructor(private db: AuthDbClient) {}

  async assign(
    userId: string,
    resourceType: string,
    resourceId: string,
    role: string,
  ): Promise<void> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    // Use ON CONFLICT DO NOTHING for idempotent assign (UNIQUE constraint handles dedup)
    const result = await this.db.query(
      sql`INSERT INTO auth_role_assignments (id, user_id, resource_type, resource_id, role, created_at)
          VALUES (${id}, ${userId}, ${resourceType}, ${resourceId}, ${role}, ${now})
          ON CONFLICT DO NOTHING`,
    );
    assertWrite(result, 'assign');
  }

  async revoke(
    userId: string,
    resourceType: string,
    resourceId: string,
    role: string,
  ): Promise<void> {
    const result = await this.db.query(
      sql`DELETE FROM auth_role_assignments WHERE user_id = ${userId} AND resource_type = ${resourceType} AND resource_id = ${resourceId} AND role = ${role}`,
    );
    assertWrite(result, 'revoke');
  }

  async getRoles(userId: string, resourceType: string, resourceId: string): Promise<string[]> {
    const result = await this.db.query<{ role: string }>(
      sql`SELECT role FROM auth_role_assignments WHERE user_id = ${userId} AND resource_type = ${resourceType} AND resource_id = ${resourceId}`,
    );
    if (!result.ok) return [];
    return result.data.rows.map((r) => r.role);
  }

  async getRolesForUser(userId: string): Promise<RoleAssignment[]> {
    const result = await this.db.query<{
      user_id: string;
      resource_type: string;
      resource_id: string;
      role: string;
    }>(
      sql`SELECT user_id, resource_type, resource_id, role FROM auth_role_assignments WHERE user_id = ${userId}`,
    );

    if (!result.ok) return [];
    return result.data.rows.map((r) => ({
      userId: r.user_id,
      resourceType: r.resource_type,
      resourceId: r.resource_id,
      role: r.role,
    }));
  }

  async getEffectiveRole(
    userId: string,
    resourceType: string,
    resourceId: string,
    accessDef: AccessDefinition,
    closureStore: ClosureStore,
  ): Promise<string | null> {
    // Delegate to the same logic as InMemory — effective role computation
    // doesn't depend on storage mechanism
    const rolesForType = accessDef.roles[resourceType];
    if (!rolesForType || rolesForType.length === 0) return null;

    const candidateRoles: string[] = [];

    const directRoles = await this.getRoles(userId, resourceType, resourceId);
    candidateRoles.push(...directRoles);

    const ancestors = await closureStore.getAncestors(resourceType, resourceId);
    for (const ancestor of ancestors) {
      if (ancestor.depth === 0) continue;
      const ancestorRoles = await this.getRoles(userId, ancestor.type, ancestor.id);
      for (const ancestorRole of ancestorRoles) {
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

    const roleOrder = [...rolesForType];
    let bestIndex = roleOrder.length;
    for (const role of candidateRoles) {
      const idx = roleOrder.indexOf(role);
      if (idx !== -1 && idx < bestIndex) {
        bestIndex = idx;
      }
    }

    return bestIndex < roleOrder.length ? roleOrder[bestIndex]! : null;
  }

  dispose(): void {
    // No cleanup needed
  }
}
