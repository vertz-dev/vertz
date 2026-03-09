/**
 * BillingAdapter — payment processor abstraction.
 *
 * Defines the interface for billing integrations (Stripe, LemonSqueezy, Paddle).
 * Only Stripe is implemented in Phase 5.
 */

import type { PlanDef } from '../define-access';

// ============================================================================
// Types
// ============================================================================

export interface BillingAdapter {
  /** Push plan definitions to the payment processor. Idempotent. */
  syncPlans(plans: Record<string, PlanDef>): Promise<void>;
  /** Create a subscription for a tenant. */
  createSubscription(tenantId: string, planId: string): Promise<string>;
  /** Cancel a tenant's subscription. */
  cancelSubscription(tenantId: string): Promise<void>;
  /** Attach an add-on to a tenant's subscription. */
  attachAddOn(tenantId: string, addOnId: string): Promise<void>;
  /** Report metered usage (overage) for a tenant. */
  reportOverage(tenantId: string, limitKey: string, amount: number): Promise<void>;
  /** Get the billing portal URL for a tenant. */
  getPortalUrl(tenantId: string): Promise<string>;
}
