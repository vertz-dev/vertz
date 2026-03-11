/**
 * Route access rule descriptors — same API as @vertz/server/auth/rules
 * but with RouteAccessRule type that excludes where() (routes have no row context).
 *
 * These are pure data structures with no evaluation logic.
 * Structurally compatible with the server AccessRule types.
 */

// ============================================================================
// Rule Types (mirrors @vertz/server/auth/rules — no server import)
// ============================================================================

export interface PublicRule {
  readonly type: 'public';
}

export interface AuthenticatedRule {
  readonly type: 'authenticated';
}

export interface RoleRule {
  readonly type: 'role';
  readonly roles: readonly string[];
}

export interface EntitlementRule {
  readonly type: 'entitlement';
  readonly entitlement: string;
}

export interface FvaRule {
  readonly type: 'fva';
  readonly maxAge: number;
}

export interface WhereRule {
  readonly type: 'where';
  readonly conditions: Record<string, unknown>;
}

export interface RouteAllRule {
  readonly type: 'all';
  readonly rules: readonly RouteAccessRule[];
}

export interface RouteAnyRule {
  readonly type: 'any';
  readonly rules: readonly RouteAccessRule[];
}

/** Full AccessRule union (including where) — for server compat */
export interface AllRule {
  readonly type: 'all';
  readonly rules: readonly AccessRule[];
}

export interface AnyRule {
  readonly type: 'any';
  readonly rules: readonly AccessRule[];
}

/**
 * Route access rule — subset of AccessRule that excludes where().
 * Routes have no "row" to check against, so where() is a type error.
 */
export type RouteAccessRule =
  | PublicRule
  | AuthenticatedRule
  | RoleRule
  | EntitlementRule
  | FvaRule
  | RouteAllRule
  | RouteAnyRule;

/** Full AccessRule (for structural compat with @vertz/server) */
export type AccessRule =
  | PublicRule
  | AuthenticatedRule
  | RoleRule
  | EntitlementRule
  | FvaRule
  | WhereRule
  | AllRule
  | AnyRule;

// ============================================================================
// User Markers — declarative placeholders resolved at evaluation time
// ============================================================================

export interface UserMarker {
  readonly __marker: string;
}

const userMarkers = {
  id: Object.freeze({ __marker: 'user.id' }) as UserMarker,
  tenantId: Object.freeze({ __marker: 'user.tenantId' }) as UserMarker,
};

// ============================================================================
// rules.* builders
// ============================================================================

export const rules = {
  /** Endpoint is public — no authentication required */
  public: Object.freeze({ type: 'public' }) as PublicRule,

  /** User must be authenticated (no specific role required) */
  authenticated(): AuthenticatedRule {
    return { type: 'authenticated' };
  },

  /** User has at least one of the specified roles (OR) */
  role(...roleNames: string[]): RoleRule {
    return { type: 'role', roles: Object.freeze([...roleNames]) };
  },

  /** User has the specified entitlement */
  entitlement(name: string): EntitlementRule {
    return { type: 'entitlement', entitlement: name };
  },

  /** Row-level condition — included for server compat, excluded from RouteAccessRule type */
  where(conditions: Record<string, unknown>): WhereRule {
    return { type: 'where', conditions: Object.freeze({ ...conditions }) };
  },

  /** All sub-rules must pass (AND) */
  all(...ruleList: RouteAccessRule[]): RouteAllRule {
    return { type: 'all', rules: Object.freeze([...ruleList]) };
  },

  /** At least one sub-rule must pass (OR) */
  any(...ruleList: RouteAccessRule[]): RouteAnyRule {
    return { type: 'any', rules: Object.freeze([...ruleList]) };
  },

  /** User must have verified MFA within maxAge seconds */
  fva(maxAge: number): FvaRule {
    return { type: 'fva', maxAge };
  },

  /** Declarative user markers — resolved at evaluation time */
  user: userMarkers as { readonly id: UserMarker; readonly tenantId: UserMarker },
};
