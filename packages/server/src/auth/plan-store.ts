/**
 * PlanStore — org-level plan assignments with overrides.
 *
 * Stores which plan an organization is on, when it started,
 * optional expiration, and per-customer limit overrides.
 */

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
  assignPlan(orgId: string, planId: string, startedAt?: Date, expiresAt?: Date | null): void;
  getPlan(orgId: string): OrgPlan | null;
  updateOverrides(orgId: string, overrides: Record<string, LimitOverride>): void;
  removePlan(orgId: string): void;
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

  assignPlan(
    orgId: string,
    planId: string,
    startedAt: Date = new Date(),
    expiresAt: Date | null = null,
  ): void {
    this.plans.set(orgId, {
      orgId,
      planId,
      startedAt,
      expiresAt,
      overrides: {},
    });
  }

  getPlan(orgId: string): OrgPlan | null {
    return this.plans.get(orgId) ?? null;
  }

  updateOverrides(orgId: string, overrides: Record<string, LimitOverride>): void {
    const plan = this.plans.get(orgId);
    if (!plan) return;
    plan.overrides = { ...plan.overrides, ...overrides };
  }

  removePlan(orgId: string): void {
    this.plans.delete(orgId);
  }

  dispose(): void {
    this.plans.clear();
  }
}
