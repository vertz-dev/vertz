/**
 * SubscriptionStore — resource-level plan assignments with overrides.
 *
 * Stores which plan a resource (identified by resourceType + resourceId) is on,
 * when it started, optional expiration, and per-resource limit overrides.
 *
 * Single-level apps use resourceType = 'tenant'. Multi-level tenancy uses
 * entity-specific types (e.g., 'account', 'project').
 */

import type { AccessDefinition } from './define-access';

// ============================================================================
// Types
// ============================================================================

/** Per-resource limit override. Only affects the cap, not the billing period. */
export interface LimitOverride {
  max: number;
}

export interface Subscription {
  resourceType: string;
  resourceId: string;
  planId: string;
  startedAt: Date;
  expiresAt: Date | null;
  overrides: Record<string, LimitOverride>;
}

export interface SubscriptionStore {
  /**
   * Assign a plan to a resource. Resets per-resource overrides (overrides are plan-specific).
   * To preserve overrides across plan changes, re-apply them after calling assign().
   */
  assign(
    resourceType: string,
    resourceId: string,
    planId: string,
    startedAt?: Date,
    expiresAt?: Date | null,
  ): Promise<void>;
  get(resourceType: string, resourceId: string): Promise<Subscription | null>;
  updateOverrides(
    resourceType: string,
    resourceId: string,
    overrides: Record<string, LimitOverride>,
  ): Promise<void>;
  remove(resourceType: string, resourceId: string): Promise<void>;
  /** Attach an add-on to a resource. */
  attachAddOn?(resourceType: string, resourceId: string, addOnId: string): Promise<void>;
  /** Detach an add-on from a resource. */
  detachAddOn?(resourceType: string, resourceId: string, addOnId: string): Promise<void>;
  /** Get all active add-on IDs for a resource. */
  getAddOns?(resourceType: string, resourceId: string): Promise<string[]>;
  /** List all resources assigned to a specific plan. */
  listByPlan?(planId: string): Promise<Array<{ resourceType: string; resourceId: string }>>;
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

  private key(resourceType: string, resourceId: string): string {
    return `${resourceType}:${resourceId}`;
  }

  async assign(
    resourceType: string,
    resourceId: string,
    planId: string,
    startedAt: Date = new Date(),
    expiresAt: Date | null = null,
  ): Promise<void> {
    this.subscriptions.set(this.key(resourceType, resourceId), {
      resourceType,
      resourceId,
      planId,
      startedAt,
      expiresAt,
      overrides: {},
    });
  }

  async get(resourceType: string, resourceId: string): Promise<Subscription | null> {
    return this.subscriptions.get(this.key(resourceType, resourceId)) ?? null;
  }

  async updateOverrides(
    resourceType: string,
    resourceId: string,
    overrides: Record<string, LimitOverride>,
  ): Promise<void> {
    const sub = this.subscriptions.get(this.key(resourceType, resourceId));
    if (!sub) return;
    sub.overrides = { ...sub.overrides, ...overrides };
  }

  async remove(resourceType: string, resourceId: string): Promise<void> {
    this.subscriptions.delete(this.key(resourceType, resourceId));
  }

  async attachAddOn(resourceType: string, resourceId: string, addOnId: string): Promise<void> {
    const k = this.key(resourceType, resourceId);
    if (!this.addOns.has(k)) {
      this.addOns.set(k, new Set());
    }
    this.addOns.get(k)!.add(addOnId);
  }

  async detachAddOn(resourceType: string, resourceId: string, addOnId: string): Promise<void> {
    this.addOns.get(this.key(resourceType, resourceId))?.delete(addOnId);
  }

  async getAddOns(resourceType: string, resourceId: string): Promise<string[]> {
    return [...(this.addOns.get(this.key(resourceType, resourceId)) ?? [])];
  }

  async listByPlan(planId: string): Promise<Array<{ resourceType: string; resourceId: string }>> {
    const result: Array<{ resourceType: string; resourceId: string }> = [];
    for (const sub of this.subscriptions.values()) {
      if (sub.planId === planId) {
        result.push({ resourceType: sub.resourceType, resourceId: sub.resourceId });
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
