/**
 * Access Control Module - Phase 1
 * RBAC (Role-Based Access Control) with ctx.can() and ctx.authorize()
 */
// ============================================================================
// Errors
// ============================================================================
export class AuthorizationError extends Error {
  entitlement;
  userId;
  constructor(message, entitlement, userId) {
    super(message);
    this.entitlement = entitlement;
    this.userId = userId;
    this.name = 'AuthorizationError';
  }
}
// ============================================================================
// createAccess - Factory Function
// ============================================================================
export function createAccess(config) {
  const { roles, entitlements } = config;
  // Build role -> entitlements lookup
  const roleEntitlements = new Map();
  for (const [roleName, roleDef] of Object.entries(roles)) {
    roleEntitlements.set(roleName, new Set(roleDef.entitlements));
  }
  // Build entitlement -> roles lookup
  const entitlementRoles = new Map();
  for (const [entName, entDef] of Object.entries(entitlements)) {
    entitlementRoles.set(entName, new Set(entDef.roles));
  }
  // ==========================================================================
  // Check if a role has a specific entitlement
  // ==========================================================================
  function roleHasEntitlement(role, entitlement) {
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
  async function checkEntitlement(entitlement, user) {
    if (!user) return false;
    // Phase 1: Check role -> entitlement mapping
    const allowedRoles = entitlementRoles.get(entitlement);
    if (!allowedRoles) {
      // Entitlement not defined - allow for now (could be feature flag in Phase 2)
      return true;
    }
    return allowedRoles.has(user.role) || roleHasEntitlement(user.role, entitlement);
  }
  // ==========================================================================
  // can() - Check if user can perform action
  // ==========================================================================
  async function can(entitlement, user) {
    return checkEntitlement(entitlement, user);
  }
  // ==========================================================================
  // canWithResource() - Check with resource context
  // ==========================================================================
  async function canWithResource(entitlement, _resource, user) {
    // Phase 1: Basic RBAC only
    // No resource hierarchy, no ownership checks
    // Check if user has the entitlement
    const hasEntitlement = await checkEntitlement(entitlement, user);
    if (!hasEntitlement) return false;
    // Phase 1 limitation: No ownership checks yet
    // Phase 2 would add: return resource.ownerId === user?.id || hasEntitlement;
    return true;
  }
  // ==========================================================================
  // authorize() - Throws if not authorized
  // ==========================================================================
  async function authorize(entitlement, user) {
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
  async function authorizeWithResource(entitlement, resource, user) {
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
  async function canAll(checks, user) {
    const results = new Map();
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
  function getEntitlementsForRole(role) {
    const roleEnts = roleEntitlements.get(role);
    return roleEnts ? Array.from(roleEnts) : [];
  }
  // ==========================================================================
  // Middleware
  // ==========================================================================
  function createMiddleware() {
    return async (ctx, next) => {
      // Attach can and authorize to context
      ctx.can = async (entitlement, resource) => {
        if (resource) {
          return canWithResource(entitlement, resource, ctx.user ?? null);
        }
        return can(entitlement, ctx.user ?? null);
      };
      ctx.authorize = async (entitlement, resource) => {
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
export const defaultAccess = createAccess({
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
//# sourceMappingURL=access.js.map
