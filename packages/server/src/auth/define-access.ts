/**
 * defineAccess() — Entity-centric RBAC & Access Control configuration
 *
 * Entities are the root-level grouping — each entity is self-contained
 * with its roles and inheritance. Hierarchy is inferred from `inherits`
 * declarations. Entitlements map to entity-scoped roles.
 */

import { type CloudConfig, type StorageConfig, validateCloudConfig } from './cloud/cloud-config';

export type { StorageConfig } from './cloud/cloud-config';

import type { AccessRule } from './rules';

// ============================================================================
// Types
// ============================================================================

/** Denial reasons ordered by actionability (most actionable first) */
export type DenialReason =
  | 'plan_required'
  | 'role_required'
  | 'limit_reached'
  | 'flag_disabled'
  | 'hierarchy_denied'
  | 'step_up_required'
  | 'not_authenticated';

/** Metadata attached to denial reasons */
export interface DenialMeta {
  requiredPlans?: string[];
  requiredRoles?: string[];
  disabledFlags?: string[];
  limit?: {
    key?: string;
    max: number;
    consumed: number;
    remaining: number;
    /** True when the tenant is consuming beyond the limit under overage billing */
    overage?: boolean;
  };
  fvaMaxAge?: number;
  /** True when a cloud wallet API call failed during this check */
  cloudError?: boolean;
}

/** Result of a full access check (all layers evaluated) */
export interface AccessCheckResult {
  allowed: boolean;
  reasons: DenialReason[];
  reason?: DenialReason;
  meta?: DenialMeta;
}

/** Billing period for plan limits */
export type BillingPeriod = 'month' | 'day' | 'hour' | 'quarter' | 'year';

/** Valid price intervals for plans */
export type PriceInterval = 'month' | 'quarter' | 'year' | 'one_off';

/** Plan price definition */
export interface PlanPrice {
  amount: number;
  interval: PriceInterval;
}

/** Overage billing configuration for a limit */
export interface OverageConfig {
  /** Price per unit of overage (e.g., 0.01 for $0.01 per extra unit) */
  amount: number;
  /** Units per charge (e.g., 1 = charge per unit, 100 = charge per 100 units) */
  per: number;
  /** Maximum overage charge per period (safety cap). Omit for no cap. */
  cap?: number;
}

/** Limit definition within a plan — gates an entitlement with optional scoping */
export interface LimitDef {
  max: number;
  gates: string;
  /** Billing period for the limit. Omitted = lifetime (no reset). */
  per?: BillingPeriod;
  /** Entity scope — omitted = tenant-level, string = per entity instance */
  scope?: string;
  /** Overage billing: allow usage beyond limit at per-unit cost */
  overage?: OverageConfig;
}

/** Add-on compatibility — restricts which base plans an add-on can be attached to */
export interface AddOnRequires {
  group: string;
  plans: readonly string[] | string[];
}

/** Grace period duration for grandfathering policy */
export type GraceDuration = '1m' | '3m' | '6m' | '12m' | 'indefinite';

/** Grandfathering policy for a plan */
export interface GrandfatheringPolicy {
  grace?: GraceDuration;
}

/** Plan definition — features, limits, metadata, and billing */
export interface PlanDef {
  title?: string;
  description?: string;
  group?: string;
  addOn?: boolean;
  price?: PlanPrice;
  features?: readonly string[] | string[];
  limits?: Record<string, LimitDef>;
  /** Grandfathering policy — how long existing tenants keep old version on plan change */
  grandfathering?: GrandfatheringPolicy;
  /** Add-on only: restricts attachment to tenants on compatible base plans */
  requires?: AddOnRequires;
}

// ============================================================================
// New entity-centric types
// ============================================================================

/** Entity definition — roles and optional inheritance from parent entity roles */
export interface EntityDef {
  roles: readonly string[] | string[];
  inherits?: Record<string, string>;
}

/** Resolved entitlement definition — roles + optional rules */
export interface EntitlementDef {
  roles: string[];
  rules?: AccessRule[];
  flags?: string[];
  /** Plan names that gate this entitlement (evaluated in Layer 4) */
  plans?: string[];
}

/** Entitlement callback context — provides `where()` and `user` for attribute rules */
export interface RuleContext {
  where(conditions: Record<string, unknown>): AccessRule;
  user: {
    readonly id: { readonly __marker: string };
    readonly tenantId: { readonly __marker: string };
  };
}

/** Entitlement value: object or callback returning object */
export type EntitlementValue = EntitlementDef | ((r: RuleContext) => EntitlementDef);

/** The input config for defineAccess() */
export interface DefineAccessInput {
  entities: Record<string, EntityDef>;
  entitlements: Record<string, EntitlementValue>;
  plans?: Record<string, PlanDef>;
  /** Fallback plan name when an org's plan expires. Defaults to 'free'. */
  defaultPlan?: string;
  /** Storage config — local DB and/or Vertz Cloud for wallet/billing data */
  storage?: StorageConfig;
}

/** The frozen config returned by defineAccess() */
export interface AccessDefinition {
  /** Inferred hierarchy from inherits declarations */
  readonly hierarchy: readonly string[];
  /** Entities keyed by name */
  readonly entities: Readonly<Record<string, Readonly<EntityDef>>>;
  /** Roles per entity (derived from entities for downstream compat) */
  readonly roles: Readonly<Record<string, readonly string[]>>;
  /** Inheritance map per entity (derived from entities for downstream compat) */
  readonly inheritance: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Resolved entitlements */
  readonly entitlements: Readonly<Record<string, Readonly<EntitlementDef>>>;
  readonly plans?: Readonly<Record<string, Readonly<PlanDef>>>;
  /** Fallback plan name when an org's plan expires. Defaults to 'free'. */
  readonly defaultPlan?: string;
  /**
   * Computed: Set of entitlements that are gated by at least one plan's `features`.
   * If an entitlement is in this set, a plan check is required during `can()`.
   */
  readonly _planGatedEntitlements: ReadonlySet<string>;
  /**
   * Computed: Map from entitlement to all limit keys that gate it.
   * Used during can() to find all limits that need to pass for an entitlement.
   */
  readonly _entitlementToLimitKeys: Readonly<Record<string, readonly string[]>>;
  /** Cloud configuration, if storage.cloud was provided */
  readonly _cloudConfig?: Readonly<CloudConfig>;
}

// ============================================================================
// defineAccess()
// ============================================================================

export function defineAccess(input: DefineAccessInput): AccessDefinition {
  const { entities, entitlements: rawEntitlements } = input;

  // ---- Validate entity roles: no duplicates ----
  for (const [entityName, entityDef] of Object.entries(entities)) {
    const roleSet = new Set<string>();
    for (const role of entityDef.roles) {
      if (roleSet.has(role)) {
        throw new Error(`Duplicate role '${role}' in entity '${entityName}'`);
      }
      roleSet.add(role);
    }
  }

  // ---- Validate inherits references and build inheritance graph ----
  // parentEntity -> Set<childEntity>
  const parentToChildren = new Map<string, Set<string>>();
  // childEntity -> parentEntity
  const childToParent = new Map<string, string>();
  // Build the old-style inheritance map: parentEntity -> { parentRole: childRole }
  const inheritanceMap: Record<string, Record<string, string>> = {};

  for (const [entityName, entityDef] of Object.entries(entities)) {
    if (!entityDef.inherits) continue;

    // Track parent entities referenced by this entity's inherits
    const parentEntities = new Set<string>();

    for (const [inheritKey, localRole] of Object.entries(entityDef.inherits)) {
      // Parse 'entity:role' format
      const colonIdx = inheritKey.indexOf(':');
      if (colonIdx === -1) {
        throw new Error(
          `Invalid inherits key '${inheritKey}' in entity '${entityName}' — expected format 'entity:role'`,
        );
      }

      const parentEntityName = inheritKey.substring(0, colonIdx);
      const parentRoleName = inheritKey.substring(colonIdx + 1);

      // Self-referencing check (rule 3)
      if (parentEntityName === entityName) {
        throw new Error(`Entity '${entityName}' cannot inherit from itself`);
      }

      // Parent entity must exist (rule 1)
      if (!(parentEntityName in entities)) {
        throw new Error(`Entity '${parentEntityName}' in ${entityName}.inherits is not defined`);
      }

      // Parent role must exist on the parent entity (rule 1)
      const parentEntity = entities[parentEntityName];
      if (!parentEntity.roles.includes(parentRoleName)) {
        throw new Error(`Role '${parentRoleName}' does not exist on entity '${parentEntityName}'`);
      }

      // Local role must exist on this entity (rule 2)
      if (!entityDef.roles.includes(localRole)) {
        throw new Error(`Role '${localRole}' does not exist on entity '${entityName}'`);
      }

      parentEntities.add(parentEntityName);

      // Build inheritance map (parent -> { parentRole: childRole })
      if (!inheritanceMap[parentEntityName]) {
        inheritanceMap[parentEntityName] = {};
      }
      inheritanceMap[parentEntityName][parentRoleName] = localRole;
    }

    // Linear chain validation (rule 5): all inherits keys must reference the same parent
    if (parentEntities.size > 1) {
      throw new Error(
        `Entity '${entityName}' inherits from multiple parents (${[...parentEntities].join(', ')}). Each entity can only inherit from one parent.`,
      );
    }

    const parentEntityName = [...parentEntities][0];
    if (parentEntityName) {
      // Check for multiple children pointing to same parent (allow it for separate chains)
      if (!parentToChildren.has(parentEntityName)) {
        parentToChildren.set(parentEntityName, new Set());
      }
      parentToChildren.get(parentEntityName)!.add(entityName);

      // Track child -> parent for cycle detection
      if (childToParent.has(entityName)) {
        throw new Error(`Entity '${entityName}' inherits from multiple parents`);
      }
      childToParent.set(entityName, parentEntityName);
    }
  }

  // ---- Cycle detection (rule 4) ----
  detectCycles(childToParent);

  // ---- Inheritance direction validation (rules 20-21) ----
  // After building childToParent, check if any entity that IS a child
  // also has an entity that tries to inherit from it
  // (This is inherently handled by the graph structure — if A inherits from B
  //  and B inherits from A, cycle detection catches it)

  // ---- Infer hierarchy via topological sort ----
  const hierarchy = inferHierarchy(entities, childToParent, parentToChildren);

  // ---- Hierarchy depth check (rule 6) ----
  if (hierarchy.length > 4) {
    throw new Error('Hierarchy depth must not exceed 4 levels');
  }

  // ---- Resolve entitlements: callback format and validation ----
  const resolvedEntitlements: Record<string, EntitlementDef> = {};
  const ruleContext = createRuleContext();

  for (const [entName, entValue] of Object.entries(rawEntitlements)) {
    // Parse entity prefix from entitlement name (rule 9)
    const colonIdx = entName.indexOf(':');
    if (colonIdx === -1) {
      throw new Error(`Entitlement '${entName}' must use format 'entity:action'`);
    }
    const entityPrefix = entName.substring(0, colonIdx);
    if (!(entityPrefix in entities)) {
      throw new Error(`Entitlement '${entName}' references undefined entity '${entityPrefix}'`);
    }

    // Resolve callback format
    let entDef: EntitlementDef;
    if (typeof entValue === 'function') {
      entDef = entValue(ruleContext);
    } else {
      entDef = entValue;
    }

    // Validate entitlement roles belong to the referenced entity (rule 10)
    const entityRoles = entities[entityPrefix].roles;
    for (const role of entDef.roles) {
      if (!entityRoles.includes(role)) {
        throw new Error(
          `Role '${role}' in '${entName}' does not exist on entity '${entityPrefix}'`,
        );
      }
    }

    resolvedEntitlements[entName] = entDef;
  }

  // ---- Validate plans (Phase 2) ----
  const entitlementSet = new Set(Object.keys(resolvedEntitlements));
  const entityNameSet = new Set(Object.keys(entities));

  if (input.plans) {
    for (const [planName, planDef] of Object.entries(input.plans)) {
      // Rule 12: Plan features must reference defined entitlements
      if (planDef.features) {
        for (const feature of planDef.features) {
          if (!entitlementSet.has(feature)) {
            throw new Error(`Plan '${planName}' feature '${feature}' is not a defined entitlement`);
          }
        }
      }

      // Rule 13: Limit gates must reference a defined entitlement
      if (planDef.limits) {
        for (const [limitKey, limitDef] of Object.entries(planDef.limits)) {
          if (!entitlementSet.has(limitDef.gates)) {
            throw new Error(`Limit '${limitKey}' gates '${limitDef.gates}' which is not defined`);
          }

          // Rule 14: Limit scope must reference a defined entity
          if (limitDef.scope && !entityNameSet.has(limitDef.scope)) {
            throw new Error(
              `Limit '${limitKey}' scope '${limitDef.scope}' is not a defined entity`,
            );
          }

          // Rule 19: limit.max must be -1, 0, or positive integer
          if (limitDef.max < -1 || (limitDef.max < 0 && limitDef.max !== -1)) {
            throw new Error(
              `Limit '${limitKey}' max must be -1 (unlimited), 0 (disabled), or a positive integer, got ${limitDef.max}`,
            );
          }
          if (!Number.isInteger(limitDef.max)) {
            throw new Error(
              `Limit '${limitKey}' max must be -1 (unlimited), 0 (disabled), or a positive integer, got ${limitDef.max}`,
            );
          }
        }
      }

      // Rule 17: Base plans must have group; add-ons must NOT
      if (planDef.addOn) {
        if (planDef.group) {
          throw new Error(`Add-on '${planName}' must not have a group`);
        }
      } else {
        if (!planDef.group) {
          throw new Error(`Base plan '${planName}' must have a group`);
        }
        // requires is only valid on add-ons
        if (planDef.requires) {
          throw new Error(`Plan '${planName}': 'requires' is only valid on add-on plans`);
        }
      }

      // Validate requires references
      if (planDef.addOn && planDef.requires) {
        for (const reqPlan of planDef.requires.plans) {
          if (!input.plans[reqPlan]) {
            throw new Error(`Add-on '${planName}' requires plan '${reqPlan}' is not defined`);
          }
        }
      }
    }

    // Rule 15: defaultPlan must reference a base plan (not an add-on)
    if (input.defaultPlan) {
      const defaultPlanDef = input.plans[input.defaultPlan];
      if (defaultPlanDef?.addOn) {
        throw new Error(`defaultPlan '${input.defaultPlan}' is an add-on, not a base plan`);
      }
    }

    // Rule 18: Add-on limit keys must match existing base plan limit keys
    const basePlanLimitKeys = new Set<string>();
    for (const [, planDef] of Object.entries(input.plans)) {
      if (!planDef.addOn && planDef.limits) {
        for (const limitKey of Object.keys(planDef.limits)) {
          basePlanLimitKeys.add(limitKey);
        }
      }
    }
    for (const [, planDef] of Object.entries(input.plans)) {
      if (planDef.addOn && planDef.limits) {
        for (const limitKey of Object.keys(planDef.limits)) {
          if (!basePlanLimitKeys.has(limitKey)) {
            throw new Error(`Add-on limit '${limitKey}' not defined in any base plan`);
          }
        }
      }
    }
  }

  // ---- Compute plan-gated entitlements and limit-to-entitlement mappings ----
  const planGatedEntitlements = new Set<string>();
  const entitlementToLimitKeys: Record<string, string[]> = {};

  if (input.plans) {
    for (const [, planDef] of Object.entries(input.plans)) {
      if (planDef.features) {
        for (const feature of planDef.features) {
          planGatedEntitlements.add(feature);
        }
      }
      if (planDef.limits) {
        for (const [limitKey, limitDef] of Object.entries(planDef.limits)) {
          if (!entitlementToLimitKeys[limitDef.gates]) {
            entitlementToLimitKeys[limitDef.gates] = [];
          }
          if (!entitlementToLimitKeys[limitDef.gates].includes(limitKey)) {
            entitlementToLimitKeys[limitDef.gates].push(limitKey);
          }
        }
      }
    }
  }

  // ---- Validate storage config ----
  if (input.storage?.cloud) {
    validateCloudConfig(input.storage.cloud);
  }

  // ---- Build frozen config ----
  // Build roles map from entities
  const rolesMap: Record<string, readonly string[]> = {};
  for (const [entityName, entityDef] of Object.entries(entities)) {
    rolesMap[entityName] = Object.freeze([...entityDef.roles]);
  }

  const config: AccessDefinition = {
    hierarchy: Object.freeze([...hierarchy]),
    entities: Object.freeze(
      Object.fromEntries(
        Object.entries(entities).map(([k, v]) => [
          k,
          Object.freeze({
            roles: Object.freeze([...v.roles]),
            ...(v.inherits ? { inherits: Object.freeze({ ...v.inherits }) } : {}),
          }),
        ]),
      ),
    ),
    roles: Object.freeze(rolesMap),
    inheritance: Object.freeze(
      Object.fromEntries(
        Object.entries(inheritanceMap).map(([k, v]) => [k, Object.freeze({ ...v })]),
      ),
    ),
    entitlements: Object.freeze(
      Object.fromEntries(
        Object.entries(resolvedEntitlements).map(([k, v]) => [k, Object.freeze({ ...v })]),
      ),
    ),
    _planGatedEntitlements: Object.freeze(planGatedEntitlements),
    _entitlementToLimitKeys: Object.freeze(
      Object.fromEntries(
        Object.entries(entitlementToLimitKeys).map(([k, v]) => [k, Object.freeze([...v])]),
      ),
    ),
    ...(input.storage?.cloud ? { _cloudConfig: Object.freeze({ ...input.storage.cloud }) } : {}),
    ...(input.defaultPlan ? { defaultPlan: input.defaultPlan } : {}),
    ...(input.plans
      ? {
          plans: Object.freeze(
            Object.fromEntries(
              Object.entries(input.plans).map(([planName, planDef]) => [
                planName,
                Object.freeze({
                  ...(planDef.title ? { title: planDef.title } : {}),
                  ...(planDef.description ? { description: planDef.description } : {}),
                  ...(planDef.group ? { group: planDef.group } : {}),
                  ...(planDef.addOn ? { addOn: planDef.addOn } : {}),
                  ...(planDef.price ? { price: Object.freeze({ ...planDef.price }) } : {}),
                  ...(planDef.features ? { features: Object.freeze([...planDef.features]) } : {}),
                  ...(planDef.limits
                    ? {
                        limits: Object.freeze(
                          Object.fromEntries(
                            Object.entries(planDef.limits).map(([k, v]) => [
                              k,
                              Object.freeze({ ...v }),
                            ]),
                          ),
                        ),
                      }
                    : {}),
                  ...(planDef.grandfathering
                    ? { grandfathering: Object.freeze({ ...planDef.grandfathering }) }
                    : {}),
                  ...(planDef.requires
                    ? {
                        requires: Object.freeze({
                          group: planDef.requires.group,
                          plans: Object.freeze([...planDef.requires.plans]),
                        }),
                      }
                    : {}),
                }),
              ]),
            ),
          ),
        }
      : {}),
  };

  return Object.freeze(config);
}

// ============================================================================
// Hierarchy inference
// ============================================================================

/**
 * Infer hierarchy from inherits declarations via topological sort.
 * Returns ordered array from root to leaf.
 * Entities not in any chain are excluded from hierarchy.
 */
function inferHierarchy(
  entities: Record<string, EntityDef>,
  childToParent: Map<string, string>,
  parentToChildren: Map<string, Set<string>>,
): string[] {
  // Find all entities that participate in inheritance
  const inInheritance = new Set<string>();
  for (const [child, parent] of childToParent.entries()) {
    inInheritance.add(child);
    inInheritance.add(parent);
  }

  if (inInheritance.size === 0) {
    // No inheritance — all entities are standalone roots
    // Return them in definition order
    return Object.keys(entities);
  }

  // Find roots (entities in inheritance that have no parent)
  const roots: string[] = [];
  for (const entity of inInheritance) {
    if (!childToParent.has(entity)) {
      roots.push(entity);
    }
  }

  // Walk each chain from root to leaf
  const hierarchy: string[] = [];
  const visited = new Set<string>();

  function walkChain(entity: string): void {
    if (visited.has(entity)) return;
    visited.add(entity);
    hierarchy.push(entity);

    const children = parentToChildren.get(entity);
    if (children) {
      for (const child of children) {
        walkChain(child);
      }
    }
  }

  for (const root of roots) {
    walkChain(root);
  }

  // Add standalone entities (not in any inheritance chain)
  for (const entityName of Object.keys(entities)) {
    if (!visited.has(entityName)) {
      hierarchy.push(entityName);
    }
  }

  return hierarchy;
}

// ============================================================================
// Cycle detection
// ============================================================================

function detectCycles(childToParent: Map<string, string>): void {
  const visited = new Set<string>();
  const inPath = new Set<string>();

  for (const entity of childToParent.keys()) {
    if (!visited.has(entity)) {
      walkForCycles(entity, childToParent, visited, inPath);
    }
  }
}

function walkForCycles(
  entity: string,
  childToParent: Map<string, string>,
  visited: Set<string>,
  inPath: Set<string>,
): void {
  if (inPath.has(entity)) {
    throw new Error('Circular inheritance detected');
  }
  if (visited.has(entity)) return;

  inPath.add(entity);
  const parent = childToParent.get(entity);
  if (parent) {
    walkForCycles(parent, childToParent, visited, inPath);
  }
  inPath.delete(entity);
  visited.add(entity);
}

// ============================================================================
// Rule context factory
// ============================================================================

function createRuleContext(): RuleContext {
  return {
    where(conditions: Record<string, unknown>): AccessRule {
      return { type: 'where', conditions: Object.freeze({ ...conditions }) };
    },
    user: {
      id: Object.freeze({ __marker: 'user.id' }),
      tenantId: Object.freeze({ __marker: 'user.tenantId' }),
    },
  };
}
