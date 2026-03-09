/**
 * PlanStore — org-level plan assignments with overrides.
 *
 * Stores which plan an organization is on, when it started,
 * optional expiration, and per-customer limit overrides.
 */

import type { AccessDefinition } from './define-access';

// ============================================================================
// Types
// ============================================================================

/** Per-customer limit override. Only affects the cap, not the billing period. */
export interface LimitOverride {
  max: number;
}

export interface OrgPlan {
  orgId: string;
  planId: string;
  startedAt: Date;
  expiresAt: Date | null;
  overrides: Record<string, LimitOverride>;
}

export interface PlanStore {
  /**
   * Assign a plan to an org. Resets per-customer overrides (overrides are plan-specific).
   * To preserve overrides across plan changes, re-apply them after calling assignPlan().
   */
  assignPlan(
    orgId: string,
    planId: string,
    startedAt?: Date,
    expiresAt?: Date | null,
  ): Promise<void>;
  getPlan(orgId: string): Promise<OrgPlan | null>;
  updateOverrides(orgId: string, overrides: Record<string, LimitOverride>): Promise<void>;
  removePlan(orgId: string): Promise<void>;
  /** Attach an add-on to an org. */
  attachAddOn?(orgId: string, addOnId: string): Promise<void>;
  /** Detach an add-on from an org. */
  detachAddOn?(orgId: string, addOnId: string): Promise<void>;
  /** Get all active add-on IDs for an org. */
  getAddOns?(orgId: string): Promise<string[]>;
  /** List all org IDs assigned to a specific plan. */
  listByPlan?(planId: string): Promise<string[]>;
  dispose(): void;
}

// ============================================================================
// Plan Resolution
// ============================================================================

/**
 * Resolve the effective plan for an org.
 * If the plan is expired, falls back to the configured defaultPlan
 * (or 'free' if not configured) if it exists in the plans definition.
 * Returns null if no valid plan can be resolved.
 *
 * @param orgPlan - The org's plan assignment
 * @param plans - The plans definition from defineAccess()
 * @param defaultPlan - Fallback plan name on expiration (defaults to 'free')
 * @param now - Optional timestamp for deterministic testing (defaults to Date.now())
 */
export function resolveEffectivePlan(
  orgPlan: OrgPlan | null,
  plans: Readonly<Record<string, unknown>> | undefined,
  defaultPlan = 'free',
  now?: number,
): string | null {
  if (!orgPlan) return null;

  // Check expiration
  // NOTE: Grace period (`planGracePeriod`) and `plan_expiring` flag are
  // explicitly deferred to Phase 9. See issue #1022 Non-Goals.
  if (orgPlan.expiresAt && orgPlan.expiresAt.getTime() < (now ?? Date.now())) {
    // Expired — fall back to defaultPlan (or 'free') if it exists
    return plans?.[defaultPlan] ? defaultPlan : null;
  }

  // Verify the plan exists in the definition
  if (!plans?.[orgPlan.planId]) return null;

  return orgPlan.planId;
}

// ============================================================================
// InMemoryPlanStore
// ============================================================================

export class InMemoryPlanStore implements PlanStore {
  private plans = new Map<string, OrgPlan>();
  private addOns = new Map<string, Set<string>>();

  async assignPlan(
    orgId: string,
    planId: string,
    startedAt: Date = new Date(),
    expiresAt: Date | null = null,
  ): Promise<void> {
    this.plans.set(orgId, {
      orgId,
      planId,
      startedAt,
      expiresAt,
      overrides: {},
    });
  }

  async getPlan(orgId: string): Promise<OrgPlan | null> {
    return this.plans.get(orgId) ?? null;
  }

  async updateOverrides(orgId: string, overrides: Record<string, LimitOverride>): Promise<void> {
    const plan = this.plans.get(orgId);
    if (!plan) return;
    plan.overrides = { ...plan.overrides, ...overrides };
  }

  async removePlan(orgId: string): Promise<void> {
    this.plans.delete(orgId);
  }

  async attachAddOn(orgId: string, addOnId: string): Promise<void> {
    if (!this.addOns.has(orgId)) {
      this.addOns.set(orgId, new Set());
    }
    this.addOns.get(orgId)!.add(addOnId);
  }

  async detachAddOn(orgId: string, addOnId: string): Promise<void> {
    this.addOns.get(orgId)?.delete(addOnId);
  }

  async getAddOns(orgId: string): Promise<string[]> {
    return [...(this.addOns.get(orgId) ?? [])];
  }

  async listByPlan(planId: string): Promise<string[]> {
    const result: string[] = [];
    for (const [orgId, plan] of this.plans.entries()) {
      if (plan.planId === planId) {
        result.push(orgId);
      }
    }
    return result;
  }

  dispose(): void {
    this.plans.clear();
    this.addOns.clear();
  }
}

// ============================================================================
// Add-on Compatibility
// ============================================================================

/**
 * Check if an add-on is compatible with a given base plan.
 * Returns true if the add-on has no `requires` or if the plan is in the requires list.
 */
export function checkAddOnCompatibility(
  accessDef: AccessDefinition,
  addOnId: string,
  currentPlanId: string,
): boolean {
  const addOnDef = accessDef.plans?.[addOnId];
  if (!addOnDef?.requires) return true; // No requirements — always compatible
  return addOnDef.requires.plans.includes(currentPlanId);
}

/**
 * Get add-ons that are incompatible with a target plan.
 * Used to flag incompatible add-ons when a tenant downgrades.
 */
export function getIncompatibleAddOns(
  accessDef: AccessDefinition,
  activeAddOnIds: string[],
  targetPlanId: string,
): string[] {
  return activeAddOnIds.filter((id) => !checkAddOnCompatibility(accessDef, id, targetPlanId));
}
