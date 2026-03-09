/**
 * defineAccess() — Phase 6 RBAC & Access Control configuration
 *
 * Replaces createAccess() with hierarchical RBAC: resources form trees,
 * roles inherit down the hierarchy, and entitlements map to roles/plans/flags.
 */

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
  limit?: { max: number; consumed: number; remaining: number };
  fvaMaxAge?: number;
}

/** Result of a full access check (all layers evaluated) */
export interface AccessCheckResult {
  allowed: boolean;
  reasons: DenialReason[];
  reason?: DenialReason;
  meta?: DenialMeta;
}

/** Entitlement definition — maps to roles, optional plans and flags */
export interface EntitlementDef {
  roles: string[];
  plans?: string[];
  flags?: string[];
}

/** Billing period for plan limits */
export type BillingPeriod = 'month' | 'day' | 'hour';

/** Limit definition within a plan */
export interface LimitDef {
  per: BillingPeriod;
  max: number;
}

/** Plan definition — which entitlements are included and their usage limits */
export interface PlanDef {
  entitlements: readonly string[] | string[];
  limits?: Record<string, LimitDef>;
}

/** Inheritance config: parent role → child role mapping */
export type InheritanceConfig = Record<string, Record<string, string>>;

/** The input config for defineAccess() */
export interface DefineAccessInput {
  hierarchy: string[];
  roles: Record<string, string[]>;
  inheritance?: Record<string, Record<string, string>>;
  entitlements: Record<string, EntitlementDef>;
  plans?: Record<string, PlanDef>;
  /** Fallback plan name when an org's plan expires. Defaults to 'free'. */
  defaultPlan?: string;
}

/** The frozen config returned by defineAccess() */
export interface AccessDefinition {
  readonly hierarchy: readonly string[];
  readonly roles: Readonly<Record<string, readonly string[]>>;
  readonly inheritance: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly entitlements: Readonly<Record<string, Readonly<EntitlementDef>>>;
  readonly plans?: Readonly<Record<string, Readonly<PlanDef>>>;
  /** Fallback plan name when an org's plan expires. Defaults to 'free'. */
  readonly defaultPlan?: string;
}

// ============================================================================
// defineAccess()
// ============================================================================

export function defineAccess(input: DefineAccessInput): AccessDefinition {
  // ---- Validation ----
  if (input.hierarchy.length === 0) {
    throw new Error('Hierarchy must have at least one resource type');
  }
  if (input.hierarchy.length > 4) {
    throw new Error('Hierarchy depth must not exceed 4 levels');
  }

  const hierarchySet = new Set(input.hierarchy);

  // Validate roles reference known resource types
  for (const resourceType of Object.keys(input.roles)) {
    if (!hierarchySet.has(resourceType)) {
      throw new Error(`Roles reference unknown resource type: ${resourceType}`);
    }
  }

  // Validate inheritance
  const inheritance = input.inheritance ?? {};
  for (const [resourceType, mapping] of Object.entries(inheritance)) {
    if (!hierarchySet.has(resourceType)) {
      throw new Error(`Inheritance references unknown resource type: ${resourceType}`);
    }
    const parentRoles = new Set(input.roles[resourceType] ?? []);
    const hierarchyIdx = input.hierarchy.indexOf(resourceType);
    const childType = input.hierarchy[hierarchyIdx + 1];
    const childRoles = childType ? new Set(input.roles[childType] ?? []) : new Set<string>();

    for (const [parentRole, childRole] of Object.entries(mapping)) {
      if (!parentRoles.has(parentRole)) {
        throw new Error(`Inheritance for ${resourceType} references undefined role: ${parentRole}`);
      }
      if (!childRoles.has(childRole)) {
        throw new Error(
          `Inheritance for ${resourceType} maps to undefined child role: ${childRole}`,
        );
      }
    }
  }

  // Validate entitlement plan references point to defined plan names
  const planNameSet = new Set(Object.keys(input.plans ?? {}));
  for (const [entName, entDef] of Object.entries(input.entitlements)) {
    if (entDef.plans) {
      for (const planRef of entDef.plans) {
        if (!planNameSet.has(planRef)) {
          throw new Error(`Entitlement "${entName}" references unknown plan: ${planRef}`);
        }
      }
    }
  }

  // Validate plans
  const entitlementSet = new Set(Object.keys(input.entitlements));
  if (input.plans) {
    for (const [planName, planDef] of Object.entries(input.plans)) {
      const planEntitlementSet = new Set(planDef.entitlements);
      for (const ent of planDef.entitlements) {
        if (!entitlementSet.has(ent)) {
          throw new Error(`Plan "${planName}" references unknown entitlement: ${ent}`);
        }
      }
      if (planDef.limits) {
        for (const limitKey of Object.keys(planDef.limits)) {
          if (!planEntitlementSet.has(limitKey)) {
            throw new Error(
              `Plan "${planName}" has limit for "${limitKey}" which is not in the plan's entitlements`,
            );
          }
        }
      }
    }
  }

  // ---- Build frozen config ----
  const config: AccessDefinition = {
    hierarchy: Object.freeze([...input.hierarchy]),
    roles: Object.freeze(
      Object.fromEntries(Object.entries(input.roles).map(([k, v]) => [k, Object.freeze([...v])])),
    ),
    inheritance: Object.freeze(
      Object.fromEntries(
        Object.entries(input.inheritance ?? {}).map(([k, v]) => [k, Object.freeze({ ...v })]),
      ),
    ),
    entitlements: Object.freeze(
      Object.fromEntries(
        Object.entries(input.entitlements).map(([k, v]) => [k, Object.freeze({ ...v })]),
      ),
    ),
    ...(input.defaultPlan ? { defaultPlan: input.defaultPlan } : {}),
    ...(input.plans
      ? {
          plans: Object.freeze(
            Object.fromEntries(
              Object.entries(input.plans).map(([planName, planDef]) => [
                planName,
                Object.freeze({
                  entitlements: Object.freeze([...planDef.entitlements]),
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
                }),
              ]),
            ),
          ),
        }
      : {}),
  };

  return Object.freeze(config);
}
