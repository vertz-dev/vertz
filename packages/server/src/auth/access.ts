/**
 * Access Control Module - Phase 1
 * RBAC (Role-Based Access Control) with ctx.can() and ctx.authorize()
 */

import type { AuthUser } from './types';

// ============================================================================
// Types
// ============================================================================

export interface RoleDefinition {
  entitlements: string[];
}

export interface EntitlementDefinition {
  roles: string[];
  /** Optional: Description for documentation */
  description?: string;
}

export interface AccessConfig {
  roles: Record<string, RoleDefinition>;
  entitlements: Record<string, EntitlementDefinition>;
}

export interface AccessInstance {
  /** Check if user has a specific entitlement */
  can(entitlement: string, user: AuthUser | null): Promise<boolean>;
  /** Check with resource context */
  canWithResource(entitlement: string, resource: Resource, user: AuthUser | null): Promise<boolean>;
  /** Throws if not authorized */
  authorize(entitlement: string, user: AuthUser | null): Promise<void>;
  /** Authorize with resource context */
  authorizeWithResource(
    entitlement: string,
    resource: Resource,
    user: AuthUser | null,
  ): Promise<void>;
  /** Check multiple entitlements at once */
  canAll(
    checks: Array<{ entitlement: string; resource?: Resource }>,
    user: AuthUser | null,
  ): Promise<Map<string, boolean>>;
  /** Get all entitlements for a role */
  getEntitlementsForRole(role: string): string[];
  /** Middleware that adds ctx.can() and ctx.authorize() to context */
  middleware: () => any;
}

export interface Resource {
  id: string;
  type: string;
  ownerId?: string;
  [key: string]: unknown;
}

// ============================================================================
// Errors
// ============================================================================

export class AuthorizationError extends Error {
  constructor(
    message: string,
    public readonly entitlement: string,
    public readonly userId?: string,
  ) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

// ============================================================================
// createAccess - Factory Function
// ============================================================================

export function createAccess(config: AccessConfig): AccessInstance {
  const { roles, entitlements } = config;

  // Build role -> entitlements lookup
  const roleEntitlements = new Map<string, Set<string>>();

  for (const [roleName, roleDef] of Object.entries(roles)) {
    roleEntitlements.set(roleName, new Set(roleDef.entitlements));
  }

  // Build entitlement -> roles lookup
  const entitlementRoles = new Map<string, Set<string>>();

  for (const [entName, entDef] of Object.entries(entitlements)) {
    entitlementRoles.set(entName, new Set(entDef.roles));
  }

  // ==========================================================================
  // Check if a role has a specific entitlement
  // ==========================================================================

  function roleHasEntitlement(role: string, entitlement: string): boolean {
    const roleEnts = roleEntitlements.get(role);
    if (!roleEnts) return false;

    // Direct match
    if (roleEnts.has(entitlement)) return true;

    // Check wildcard entitlements (e.g., 'user:*' matches 'user:read')
    const [resource, action] = entitlement.split(':');
    if (action && resource !== '*') {
      const wildcard = `${resource}:*`;
      if (roleEnts.has(wildcard)) return true;
    }

    return false;
  }

  // ==========================================================================
  // Check if a user has a specific entitlement (via their role)
  // ==========================================================================

  async function checkEntitlement(entitlement: string, user: AuthUser | null): Promise<boolean> {
    if (!user) return false;

    // Phase 1: Check role -> entitlement mapping
    const allowedRoles = entitlementRoles.get(entitlement);
    if (!allowedRoles) {
      // Entitlement not defined in config — deny by default (secure posture)
      return false;
    }

    return allowedRoles.has(user.role) || roleHasEntitlement(user.role, entitlement);
  }

  // ==========================================================================
  // can() - Check if user can perform action
  // ==========================================================================

  async function can(entitlement: string, user: AuthUser | null): Promise<boolean> {
    return checkEntitlement(entitlement, user);
  }

  // ==========================================================================
  // canWithResource() - Check with resource context
  // ==========================================================================

  async function canWithResource(
    entitlement: string,
    resource: Resource,
    user: AuthUser | null,
  ): Promise<boolean> {
    const hasEntitlement = await checkEntitlement(entitlement, user);
    if (!hasEntitlement) return false;

    // Ownership check: if resource declares an owner, user must match.
    // Uses nullish check (!=) so empty string ownerId is treated as "no owner".
    // Admins who need to bypass ownership should use can() without resource.
    if (resource.ownerId != null && resource.ownerId !== '' && resource.ownerId !== user?.id) {
      return false;
    }

    return true;
  }

  // ==========================================================================
  // authorize() - Throws if not authorized
  // ==========================================================================

  async function authorize(entitlement: string, user: AuthUser | null): Promise<void> {
    const allowed = await can(entitlement, user);

    if (!allowed) {
      throw new AuthorizationError(
        `Not authorized to perform this action: ${entitlement}`,
        entitlement,
        user?.id,
      );
    }
  }

  // ==========================================================================
  // authorizeWithResource() - Throws if not authorized with resource
  // ==========================================================================

  async function authorizeWithResource(
    entitlement: string,
    resource: Resource,
    user: AuthUser | null,
  ): Promise<void> {
    const allowed = await canWithResource(entitlement, resource, user);

    if (!allowed) {
      throw new AuthorizationError(
        `Not authorized to perform this action on this resource: ${entitlement}`,
        entitlement,
        user?.id,
      );
    }
  }

  // ==========================================================================
  // canAll() - Bulk check
  // ==========================================================================

  async function canAll(
    checks: Array<{ entitlement: string; resource?: Resource }>,
    user: AuthUser | null,
  ): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const { entitlement, resource } of checks) {
      const key = resource ? `${entitlement}:${resource.id}` : entitlement;
      const allowed = resource
        ? await canWithResource(entitlement, resource, user)
        : await can(entitlement, user);
      results.set(key, allowed);
    }

    return results;
  }

  // ==========================================================================
  // getEntitlementsForRole() - Get all entitlements for a role
  // ==========================================================================

  function getEntitlementsForRole(role: string): string[] {
    const roleEnts = roleEntitlements.get(role);
    return roleEnts ? Array.from(roleEnts) : [];
  }

  // ==========================================================================
  // Middleware
  // ==========================================================================

  function createMiddleware() {
    return async (ctx: any, next: () => Promise<void>) => {
      // Attach can and authorize to context
      ctx.can = async (entitlement: string, resource?: Resource) => {
        if (resource) {
          return canWithResource(entitlement, resource, ctx.user ?? null);
        }
        return can(entitlement, ctx.user ?? null);
      };

      ctx.authorize = async (entitlement: string, resource?: Resource) => {
        if (resource) {
          return authorizeWithResource(entitlement, resource, ctx.user ?? null);
        }
        return authorize(entitlement, ctx.user ?? null);
      };

      await next();
    };
  }

  return {
    can,
    canWithResource,
    authorize,
    authorizeWithResource,
    canAll,
    getEntitlementsForRole,
    middleware: createMiddleware,
  };
}

// ============================================================================
// Default Access Config (for quick setup)
// ============================================================================

export const defaultAccess: AccessInstance = createAccess({
  roles: {
    user: { entitlements: ['read', 'create'] },
    editor: { entitlements: ['read', 'create', 'update'] },
    admin: { entitlements: ['read', 'create', 'update', 'delete'] },
  },
  entitlements: {
    'user:read': { roles: ['user', 'editor', 'admin'] },
    'user:create': { roles: ['user', 'editor', 'admin'] },
    'user:update': { roles: ['editor', 'admin'] },
    'user:delete': { roles: ['admin'] },
    read: { roles: ['user', 'editor', 'admin'] },
    create: { roles: ['user', 'editor', 'admin'] },
    update: { roles: ['editor', 'admin'] },
    delete: { roles: ['admin'] },
  },
});
