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

export interface PublicRule {
  readonly type: 'public';
}

export interface FvaRule {
  readonly type: 'fva';
  readonly maxAge: number;
}

export type AccessRule =
  | PublicRule
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
  /** Endpoint is public — no authentication required */
  public: Object.freeze({ type: 'public' }) as PublicRule,

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

// ============================================================================
// Serialized types — JSON-friendly representations
// ============================================================================

export type SerializedRule =
  | { type: 'public' }
  | { type: 'authenticated' }
  | { type: 'role'; names: string[] }
  | { type: 'entitlement'; value: string }
  | { type: 'where'; conditions: Record<string, unknown> }
  | { type: 'all'; rules: SerializedRule[] }
  | { type: 'any'; rules: SerializedRule[] }
  | { type: 'fva'; maxAge: number }
  | { type: 'deny' };

export type SerializedAccessDefinitions = {
  roles: Record<string, string[]>;
};

export type SerializedEntityRules = Record<string, Partial<Record<string, SerializedRule>>>;

// ============================================================================
// Serialization functions
// ============================================================================

/**
 * Serialize a single AccessRule to its JSON-friendly representation.
 * Rules are already plain objects — this normalizes field names
 * to match the SerializedRule contract (e.g. `roles` → `names`).
 */
export function serializeRule(rule: AccessRule): SerializedRule {
  switch (rule.type) {
    case 'public':
      return { type: 'public' };
    case 'authenticated':
      return { type: 'authenticated' };
    case 'role':
      return { type: 'role', names: [...rule.roles] };
    case 'entitlement':
      return { type: 'entitlement', value: rule.entitlement };
    case 'where':
      return { type: 'where', conditions: { ...rule.conditions } };
    case 'all':
      return { type: 'all', rules: rule.rules.map(serializeRule) };
    case 'any':
      return { type: 'any', rules: rule.rules.map(serializeRule) };
    case 'fva':
      return { type: 'fva', maxAge: rule.maxAge };
  }
}

/**
 * Serialize a defineAccess() config into role → entitlement mappings.
 * Inverts the entitlement → roles mapping to produce role → entitlements.
 */
export function serializeAccessDefinitions(
  accessDef: import('./define-access').AccessDefinition,
): SerializedAccessDefinitions {
  const roleToEntitlements: Record<string, string[]> = {};

  for (const [entName, entDef] of Object.entries(accessDef.entitlements)) {
    for (const role of entDef.roles) {
      if (!roleToEntitlements[role]) {
        roleToEntitlements[role] = [];
      }
      roleToEntitlements[role].push(entName);
    }
  }

  return { roles: roleToEntitlements };
}

/** Minimal shape needed from EntityDefinition for serialization. */
export interface SerializableEntity {
  readonly name: string;
  readonly access: Partial<Record<string, false | AccessRule | ((...args: unknown[]) => unknown)>>;
}

/**
 * Serialize entity access rules into JSON-friendly format.
 * Skips callback-based rules (not serializable).
 * Converts `false` (deny) to `{ type: 'deny' }`.
 */
export function serializeEntityRules(
  entities: readonly SerializableEntity[],
): SerializedEntityRules {
  const result: SerializedEntityRules = {};

  for (const entity of entities) {
    const serializedOps: Partial<Record<string, SerializedRule>> = {};

    for (const [op, rule] of Object.entries(entity.access)) {
      if (rule === false) {
        serializedOps[op] = { type: 'deny' };
      } else if (typeof rule !== 'function' && rule && typeof rule === 'object' && 'type' in rule) {
        serializedOps[op] = serializeRule(rule as AccessRule);
      }
    }

    result[entity.name] = serializedOps;
  }

  return result;
}
