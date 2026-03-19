/**
 * StripeBillingAdapter — Stripe implementation of BillingAdapter.
 *
 * Syncs Vertz plan definitions to Stripe Products + Prices.
 * Uses mock-friendly Stripe client interface — never imports `stripe` package directly.
 */

import type { PlanDef } from '../define-access';
import type { BillingAdapter } from './adapter';

// ============================================================================
// Stripe client interface — minimal subset for mockability
// ============================================================================

export interface StripeProduct {
  id: string;
  name: string;
  metadata: Record<string, string>;
}

export interface StripePrice {
  id: string;
  product: string;
  unit_amount: number;
  recurring: { interval: string; interval_count?: number } | null;
  active: boolean;
  metadata: Record<string, string>;
}

export interface StripeClient {
  products: {
    list(): Promise<{ data: StripeProduct[] }>;
    create(params: {
      name: string;
      metadata: Record<string, string>;
      description?: string;
    }): Promise<StripeProduct>;
    update(
      id: string,
      params: { name?: string; metadata?: Record<string, string> },
    ): Promise<StripeProduct>;
  };
  prices: {
    list(params: { product: string }): Promise<{ data: StripePrice[] }>;
    create(params: {
      product: string;
      unit_amount: number;
      currency: string;
      recurring?: { interval: string; interval_count?: number };
      metadata: Record<string, string>;
    }): Promise<StripePrice>;
    update(id: string, params: { active: boolean }): Promise<StripePrice>;
  };
}

// ============================================================================
// Interval mapping
// ============================================================================

const INTERVAL_MAP: Record<string, string> = {
  month: 'month',
  quarter: 'month', // Stripe: 3 months
  year: 'year',
};

function mapInterval(interval: string): { interval: string; interval_count?: number } {
  if (interval === 'quarter') {
    return { interval: 'month', interval_count: 3 };
  }
  return { interval: INTERVAL_MAP[interval] ?? 'month' };
}

// ============================================================================
// Config
// ============================================================================

export interface StripeBillingAdapterConfig {
  stripe: StripeClient;
  currency?: string;
}

// ============================================================================
// Implementation
// ============================================================================

export function createStripeBillingAdapter(config: StripeBillingAdapterConfig): BillingAdapter {
  const { stripe, currency = 'usd' } = config;

  async function syncPlans(plans: Record<string, PlanDef>): Promise<void> {
    // Load existing products to find matches
    const existing = await stripe.products.list();
    const existingByPlanId = new Map<string, StripeProduct>();
    for (const product of existing.data) {
      if (product.metadata.vertzPlanId) {
        existingByPlanId.set(product.metadata.vertzPlanId, product);
      }
    }

    for (const [planId, planDef] of Object.entries(plans)) {
      const metadata: Record<string, string> = {
        vertzPlanId: planId,
      };
      if (planDef.group) metadata.group = planDef.group;
      if (planDef.addOn) metadata.addOn = 'true';

      let product = existingByPlanId.get(planId);

      if (!product) {
        // Create new product
        product = await stripe.products.create({
          name: planDef.title ?? planId,
          metadata,
          description: planDef.description,
        });
      } else {
        // Update existing product
        await stripe.products.update(product.id, {
          name: planDef.title ?? planId,
          metadata,
        });
      }

      // Handle pricing
      const amount = planDef.price?.amount ?? 0;
      const interval = planDef.price?.interval;
      const unitAmount = Math.round(amount * 100); // Convert to cents

      // Check existing prices
      const existingPrices = await stripe.prices.list({ product: product.id });
      const activePrices = existingPrices.data.filter((p) => p.active);

      // Check if we already have a matching price
      const matchingPrice = activePrices.find((p) => p.unit_amount === unitAmount);

      if (!matchingPrice) {
        // Archive old prices
        for (const oldPrice of activePrices) {
          await stripe.prices.update(oldPrice.id, { active: false });
        }

        // Create new price
        const priceParams: {
          product: string;
          unit_amount: number;
          currency: string;
          recurring?: { interval: string; interval_count?: number };
          metadata: Record<string, string>;
        } = {
          product: product.id,
          unit_amount: unitAmount,
          currency,
          metadata: { vertzPlanId: planId },
        };

        if (interval && interval !== 'one_off') {
          const mapped = mapInterval(interval);
          priceParams.recurring = mapped;
        }

        await stripe.prices.create(priceParams);
      }
    }
  }

  async function createSubscription(_tenantId: string, _planId: string): Promise<string> {
    // Placeholder — will be implemented with actual Stripe subscription API
    return 'sub_placeholder';
  }

  async function cancelSubscription(_tenantId: string): Promise<void> {
    // Placeholder
  }

  async function attachAddOn(_tenantId: string, _addOnId: string): Promise<void> {
    // Placeholder
  }

  async function reportOverage(
    _tenantId: string,
    _limitKey: string,
    _amount: number,
  ): Promise<void> {
    // Placeholder
  }

  async function getPortalUrl(_tenantId: string): Promise<string> {
    return 'https://billing.stripe.com/portal/placeholder';
  }

  return {
    syncPlans,
    createSubscription,
    cancelSubscription,
    attachAddOn,
    reportOverage,
    getPortalUrl,
  };
}
