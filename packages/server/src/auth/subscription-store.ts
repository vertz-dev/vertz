/**
 * SubscriptionStore — tenant-level plan assignments with overrides.
 *
 * Stores which plan a tenant is on, when it started,
 * optional expiration, and per-tenant limit overrides.
 */

import type { AccessDefinition } from './define-access';

// ============================================================================
// Types
// ============================================================================

/** Per-tenant limit override. Only affects the cap, not the billing period. */
export interface LimitOverride {
  max: number;
}

export interface Subscription {
  tenantId: string;
  planId: string;
  startedAt: Date;
  expiresAt: Date | null;
  overrides: Record<string, LimitOverride>;
}

export interface SubscriptionStore {
  /**
   * Assign a plan to a tenant. Resets per-tenant overrides (overrides are plan-specific).
   * To preserve overrides across plan changes, re-apply them after calling assign().
   */
  assign(
    tenantId: string,
    planId: string,
    startedAt?: Date,
    expiresAt?: Date | null,
  ): Promise<void>;
  get(tenantId: string): Promise<Subscription | null>;
  updateOverrides(tenantId: string, overrides: Record<string, LimitOverride>): Promise<void>;
  remove(tenantId: string): Promise<void>;
  /** Attach an add-on to a tenant. */
  attachAddOn?(tenantId: string, addOnId: string): Promise<void>;
  /** Detach an add-on from a tenant. */
  detachAddOn?(tenantId: string, addOnId: string): Promise<void>;
  /** Get all active add-on IDs for a tenant. */
  getAddOns?(tenantId: string): Promise<string[]>;
  /** List all tenant IDs assigned to a specific plan. */
  listByPlan?(planId: string): Promise<string[]>;
  dispose(): void;
}

// ============================================================================
// Plan Resolution
// ============================================================================

/**
 * Resolve the effective plan for a tenant.
 * If the plan is expired, falls back to the configured defaultPlan
 * (or 'free' if not configured) if it exists in the plans definition.
 * Returns null if no valid plan can be resolved.
 *
 * @param subscription - The tenant's plan assignment
 * @param plans - The plans definition from defineAccess()
 * @param defaultPlan - Fallback plan name on expiration (defaults to 'free')
 * @param now - Optional timestamp for deterministic testing (defaults to Date.now())
 */
export function resolveEffectivePlan(
  subscription: Subscription | null,
  plans: Readonly<Record<string, unknown>> | undefined,
  defaultPlan = 'free',
  now?: number,
): string | null {
  if (!subscription) return null;

  // Check expiration
  // NOTE: Grace period (`planGracePeriod`) and `plan_expiring` flag are
  // explicitly deferred to Phase 9. See issue #1022 Non-Goals.
  if (subscription.expiresAt && subscription.expiresAt.getTime() < (now ?? Date.now())) {
    // Expired — fall back to defaultPlan (or 'free') if it exists
    return plans?.[defaultPlan] ? defaultPlan : null;
  }

  // Verify the plan exists in the definition
  if (!plans?.[subscription.planId]) return null;

  return subscription.planId;
}

// ============================================================================
// InMemorySubscriptionStore
// ============================================================================

export class InMemorySubscriptionStore implements SubscriptionStore {
  private subscriptions = new Map<string, Subscription>();
  private addOns = new Map<string, Set<string>>();

  async assign(
    tenantId: string,
    planId: string,
    startedAt: Date = new Date(),
    expiresAt: Date | null = null,
  ): Promise<void> {
    this.subscriptions.set(tenantId, {
      tenantId,
      planId,
      startedAt,
      expiresAt,
      overrides: {},
    });
  }

  async get(tenantId: string): Promise<Subscription | null> {
    return this.subscriptions.get(tenantId) ?? null;
  }

  async updateOverrides(tenantId: string, overrides: Record<string, LimitOverride>): Promise<void> {
    const sub = this.subscriptions.get(tenantId);
    if (!sub) return;
    sub.overrides = { ...sub.overrides, ...overrides };
  }

  async remove(tenantId: string): Promise<void> {
    this.subscriptions.delete(tenantId);
  }

  async attachAddOn(tenantId: string, addOnId: string): Promise<void> {
    if (!this.addOns.has(tenantId)) {
      this.addOns.set(tenantId, new Set());
    }
    this.addOns.get(tenantId)!.add(addOnId);
  }

  async detachAddOn(tenantId: string, addOnId: string): Promise<void> {
    this.addOns.get(tenantId)?.delete(addOnId);
  }

  async getAddOns(tenantId: string): Promise<string[]> {
    return [...(this.addOns.get(tenantId) ?? [])];
  }

  async listByPlan(planId: string): Promise<string[]> {
    const result: string[] = [];
    for (const [tenantId, sub] of this.subscriptions.entries()) {
      if (sub.planId === planId) {
        result.push(tenantId);
      }
    }
    return result;
  }

  dispose(): void {
    this.subscriptions.clear();
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
