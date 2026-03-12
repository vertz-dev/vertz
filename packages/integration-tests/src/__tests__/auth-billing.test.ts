/**
 * Integration test — Billing Integration (Phase 5: Access Redesign) [#1076]
 *
 * Validates the full billing lifecycle end-to-end:
 * - StripeBillingAdapter syncPlans (with mock Stripe)
 * - Webhook handler mapping events to plan assignments
 * - Billing event emitter lifecycle
 * - Overage computation
 *
 * Uses public package imports only (@vertz/server).
 */
import { describe, expect, it } from 'bun:test';
import {
  type BillingEvent,
  computeOverage,
  createBillingEventEmitter,
  createStripeBillingAdapter,
  createWebhookHandler,
  InMemorySubscriptionStore,
} from '@vertz/server';

// ============================================================================
// Mock Stripe client
// ============================================================================

function createMockStripe() {
  const products: Array<{ id: string; name: string; metadata: Record<string, string> }> = [];
  const prices: Array<{
    id: string;
    product: string;
    unit_amount: number;
    recurring: { interval: string } | null;
    active: boolean;
    metadata: Record<string, string>;
  }> = [];

  return {
    products: {
      list: async () => ({ data: products }),
      create: async (params: {
        name: string;
        metadata: Record<string, string>;
        description?: string;
      }) => {
        const product = {
          id: `prod_${products.length + 1}`,
          name: params.name,
          metadata: params.metadata,
        };
        products.push(product);
        return product;
      },
      update: async (id: string, params: { name?: string; metadata?: Record<string, string> }) => {
        const product = products.find((p) => p.id === id);
        if (product && params.name) product.name = params.name;
        if (product && params.metadata)
          product.metadata = { ...product.metadata, ...params.metadata };
        return product;
      },
    },
    prices: {
      list: async (params: { product: string }) => ({
        data: prices.filter((p) => p.product === params.product),
      }),
      create: async (params: {
        product: string;
        unit_amount: number;
        currency: string;
        recurring?: { interval: string };
        metadata: Record<string, string>;
      }) => {
        const price = {
          id: `price_${prices.length + 1}`,
          product: params.product,
          unit_amount: params.unit_amount,
          recurring: params.recurring ?? null,
          active: true,
          metadata: params.metadata,
        };
        prices.push(price);
        return price;
      },
      update: async (id: string, params: { active: boolean }) => {
        const price = prices.find((p) => p.id === id);
        if (price) price.active = params.active;
        return price;
      },
    },
    _products: products,
    _prices: prices,
  };
}

// ============================================================================
// E2E: Full billing lifecycle
// ============================================================================

describe('Feature: Billing E2E lifecycle', () => {
  it('sync plans → webhook subscription → event emitted → overage computed', async () => {
    const stripe = createMockStripe();
    const subscriptionStore = new InMemorySubscriptionStore();
    const emitter = createBillingEventEmitter();
    const receivedEvents: BillingEvent[] = [];

    emitter.on('subscription:created', (e) => receivedEvents.push(e));
    emitter.on('subscription:canceled', (e) => receivedEvents.push(e));

    // ── Step 1: Sync plans to Stripe ──
    const adapter = createStripeBillingAdapter({ stripe });
    await adapter.syncPlans({
      pro_monthly: {
        title: 'Pro',
        group: 'main',
        price: { amount: 29, interval: 'month' },
        features: ['doc:edit', 'project:view'],
      },
      free: {
        title: 'Free',
        group: 'main',
        features: ['doc:view'],
      },
    });

    expect(stripe._products).toHaveLength(2);
    expect(stripe._prices).toHaveLength(2);

    // ── Step 2: Webhook — new subscription created ──
    const webhookHandler = createWebhookHandler({
      subscriptionStore,
      emitter,
      defaultPlan: 'free',
      webhookSecret: 'whsec_test',
    });

    const subscriptionBody = JSON.stringify({
      id: 'evt_1',
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_123',
          metadata: { tenantId: 'org-acme' },
          items: {
            data: [{ price: { metadata: { vertzPlanId: 'pro_monthly' } } }],
          },
        },
      },
    });

    const response = await webhookHandler(
      new Request('http://localhost/webhooks', {
        method: 'POST',
        body: subscriptionBody,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'whsec_test',
        },
      }),
    );

    expect(response.status).toBe(200);

    // Verify plan assignment
    const plan = await subscriptionStore.get('org-acme');
    expect(plan).not.toBeNull();
    expect(plan?.planId).toBe('pro_monthly');

    // Verify event emitted
    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0].tenantId).toBe('org-acme');
    expect(receivedEvents[0].planId).toBe('pro_monthly');

    // ── Step 3: Webhook — subscription deleted ──
    const deleteBody = JSON.stringify({
      id: 'evt_2',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_123',
          metadata: { tenantId: 'org-acme' },
          items: {
            data: [{ price: { metadata: { vertzPlanId: 'pro_monthly' } } }],
          },
        },
      },
    });

    await webhookHandler(
      new Request('http://localhost/webhooks', {
        method: 'POST',
        body: deleteBody,
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'whsec_test',
        },
      }),
    );

    // Verify reverted to free plan
    const afterDelete = await subscriptionStore.get('org-acme');
    expect(afterDelete?.planId).toBe('free');

    // Verify cancelation event
    expect(receivedEvents).toHaveLength(2);
    expect(receivedEvents[1].tenantId).toBe('org-acme');

    // ── Step 4: Overage computation ──
    const overage = computeOverage({ consumed: 150, max: 100, rate: 0.01, cap: 5 });
    expect(overage).toBe(0.5); // (150-100)*0.01 = 0.50, within cap

    const largeOverage = computeOverage({ consumed: 1100, max: 100, rate: 0.01, cap: 5 });
    expect(largeOverage).toBe(5); // Capped at $5
  });

  it('rejects webhook with invalid signature', async () => {
    const webhookHandler = createWebhookHandler({
      subscriptionStore: new InMemorySubscriptionStore(),
      emitter: createBillingEventEmitter(),
      defaultPlan: 'free',
      webhookSecret: 'whsec_real',
    });

    const response = await webhookHandler(
      new Request('http://localhost/webhooks', {
        method: 'POST',
        body: '{}',
        headers: {
          'content-type': 'application/json',
          'stripe-signature': 'whsec_wrong',
        },
      }),
    );

    expect(response.status).toBe(400);
  });

  it('idempotent sync — running twice does not duplicate products', async () => {
    const stripe = createMockStripe();
    const adapter = createStripeBillingAdapter({ stripe });

    const plans = {
      pro: {
        title: 'Pro',
        group: 'main',
        price: { amount: 29, interval: 'month' as const },
        features: ['doc:edit'],
      },
    };

    await adapter.syncPlans(plans);
    await adapter.syncPlans(plans);

    expect(stripe._products).toHaveLength(1);
    expect(stripe._prices).toHaveLength(1);
  });
});
