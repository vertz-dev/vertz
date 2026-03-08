/**
 * rules.* builders — declarative access rule data structures.
 *
 * These are pure data structures with no evaluation logic.
 * The access context evaluates them at runtime (sub-phase 4).
 */

// ============================================================================
// Rule Types
// ============================================================================

export interface RoleRule {
  readonly type: 'role';
  readonly roles: readonly string[];
}

export interface EntitlementRule {
  readonly type: 'entitlement';
  readonly entitlement: string;
}

export interface WhereRule {
  readonly type: 'where';
  readonly conditions: Record<string, unknown>;
}

export interface AllRule {
  readonly type: 'all';
  readonly rules: readonly AccessRule[];
}

export interface AnyRule {
  readonly type: 'any';
  readonly rules: readonly AccessRule[];
}

export interface AuthenticatedRule {
  readonly type: 'authenticated';
}

export interface FvaRule {
  readonly type: 'fva';
  readonly maxAge: number;
}

export type AccessRule =
  | RoleRule
  | EntitlementRule
  | WhereRule
  | AllRule
  | AnyRule
  | AuthenticatedRule
  | FvaRule;

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
  /** User has at least one of the specified roles (OR) */
  role(...roleNames: string[]): RoleRule {
    return { type: 'role', roles: Object.freeze([...roleNames]) };
  },

  /** User has the specified entitlement (resolves role+plan+flag from defineAccess config) */
  entitlement(name: string): EntitlementRule {
    return { type: 'entitlement', entitlement: name };
  },

  /** Row-level condition — DB query syntax. Use rules.user.id for dynamic user markers */
  where(conditions: Record<string, unknown>): WhereRule {
    return { type: 'where', conditions: Object.freeze({ ...conditions }) };
  },

  /** All sub-rules must pass (AND) */
  all(...ruleList: AccessRule[]): AllRule {
    return { type: 'all', rules: Object.freeze([...ruleList]) };
  },

  /** At least one sub-rule must pass (OR) */
  any(...ruleList: AccessRule[]): AnyRule {
    return { type: 'any', rules: Object.freeze([...ruleList]) };
  },

  /** User must be authenticated (no specific role required) */
  authenticated(): AuthenticatedRule {
    return { type: 'authenticated' };
  },

  /** User must have verified MFA within maxAge seconds */
  fva(maxAge: number): FvaRule {
    return { type: 'fva', maxAge };
  },

  /** Declarative user markers — resolved at evaluation time */
  user: userMarkers as { readonly id: UserMarker; readonly tenantId: UserMarker },
};
