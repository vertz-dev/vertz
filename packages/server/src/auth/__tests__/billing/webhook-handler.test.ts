import { describe, expect, it } from 'bun:test';
import type { BillingEvent } from '../../billing/event-emitter';
import { createBillingEventEmitter } from '../../billing/event-emitter';
import { createWebhookHandler, type WebhookHandlerConfig } from '../../billing/webhook-handler';
import { InMemorySubscriptionStore } from '../../subscription-store';

function makeConfig(overrides?: Partial<WebhookHandlerConfig>): WebhookHandlerConfig {
  return {
    subscriptionStore: new InMemorySubscriptionStore(),
    emitter: createBillingEventEmitter(),
    defaultPlan: 'free',
    webhookSecret: 'whsec_test',
    ...overrides,
  };
}

function makeStripeEvent(type: string, data: Record<string, unknown>) {
  return JSON.stringify({
    id: 'evt_test',
    type,
    data: { object: data },
  });
}

async function makeRequest(body: string, secret = 'whsec_test'): Promise<Request> {
  // Simplified signature validation for tests — just use the secret as the header
  return new Request('http://localhost/webhooks', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'stripe-signature': secret,
    },
  });
}

describe('Feature: Stripe webhook handler', () => {
  describe('Given subscription.created event', () => {
    it('assigns plan to tenant via SubscriptionStore', async () => {
      const subscriptionStore = new InMemorySubscriptionStore();
      const config = makeConfig({ subscriptionStore });
      const handler = createWebhookHandler(config);

      const body = makeStripeEvent('customer.subscription.created', {
        id: 'sub_123',
        metadata: { tenantId: 'org-1' },
        items: { data: [{ price: { metadata: { vertzPlanId: 'pro_monthly' } } }] },
      });

      const response = await handler(await makeRequest(body));

      expect(response.status).toBe(200);
      const plan = await subscriptionStore.get('tenant', 'org-1');
      expect(plan).not.toBeNull();
      expect(plan?.planId).toBe('pro_monthly');
    });
  });

  describe('Given subscription.updated event (upgrade)', () => {
    it('updates tenant plan assignment', async () => {
      const subscriptionStore = new InMemorySubscriptionStore();
      await subscriptionStore.assign('tenant', 'org-1', 'pro_monthly');

      const config = makeConfig({ subscriptionStore });
      const handler = createWebhookHandler(config);

      const body = makeStripeEvent('customer.subscription.updated', {
        id: 'sub_123',
        metadata: { tenantId: 'org-1' },
        items: { data: [{ price: { metadata: { vertzPlanId: 'enterprise' } } }] },
      });

      const response = await handler(await makeRequest(body));

      expect(response.status).toBe(200);
      const plan = await subscriptionStore.get('tenant', 'org-1');
      expect(plan?.planId).toBe('enterprise');
    });
  });

  describe('Given subscription.deleted event', () => {
    it('reverts tenant to defaultPlan', async () => {
      const subscriptionStore = new InMemorySubscriptionStore();
      await subscriptionStore.assign('tenant', 'org-1', 'pro_monthly');

      const config = makeConfig({ subscriptionStore, defaultPlan: 'free' });
      const handler = createWebhookHandler(config);

      const body = makeStripeEvent('customer.subscription.deleted', {
        id: 'sub_123',
        metadata: { tenantId: 'org-1' },
        items: { data: [{ price: { metadata: { vertzPlanId: 'pro_monthly' } } }] },
      });

      const response = await handler(await makeRequest(body));

      expect(response.status).toBe(200);
      const plan = await subscriptionStore.get('tenant', 'org-1');
      expect(plan?.planId).toBe('free');
    });
  });

  describe('Given invoice.payment_failed event', () => {
    it('emits billing:payment_failed event', async () => {
      const emitter = createBillingEventEmitter();
      const received: BillingEvent[] = [];
      emitter.on('billing:payment_failed', (e) => received.push(e));

      const config = makeConfig({ emitter });
      const handler = createWebhookHandler(config);

      const body = makeStripeEvent('invoice.payment_failed', {
        subscription: 'sub_123',
        subscription_details: { metadata: { tenantId: 'org-1' } },
        metadata: { vertzPlanId: 'pro_monthly' },
        attempt_count: 2,
      });

      const response = await handler(await makeRequest(body));

      expect(response.status).toBe(200);
      expect(received).toHaveLength(1);
      expect(received[0].resourceType).toBe('tenant');
      expect(received[0].resourceId).toBe('org-1');
      expect(received[0].attempt).toBe(2);
    });
  });

  describe('Given checkout.session.completed for add-on', () => {
    it('attaches add-on to tenant', async () => {
      const subscriptionStore = new InMemorySubscriptionStore();
      await subscriptionStore.assign('tenant', 'org-1', 'pro_monthly');

      const config = makeConfig({ subscriptionStore });
      const handler = createWebhookHandler(config);

      const body = makeStripeEvent('checkout.session.completed', {
        metadata: { tenantId: 'org-1', vertzPlanId: 'export_addon', isAddOn: 'true' },
      });

      const response = await handler(await makeRequest(body));

      expect(response.status).toBe(200);
      const addOns = await subscriptionStore.getAddOns?.('tenant', 'org-1');
      expect(addOns).toContain('export_addon');
    });
  });

  describe('Given invalid webhook signature', () => {
    it('returns 400 response', async () => {
      const config = makeConfig({ webhookSecret: 'whsec_real' });
      const handler = createWebhookHandler(config);

      const body = makeStripeEvent('customer.subscription.created', {
        id: 'sub_123',
        metadata: { tenantId: 'org-1' },
        items: { data: [{ price: { metadata: { vertzPlanId: 'pro' } } }] },
      });

      // Send with wrong secret
      const response = await handler(await makeRequest(body, 'whsec_wrong'));

      expect(response.status).toBe(400);
    });
  });

  describe('Given SubscriptionStore throws during processing', () => {
    it('returns 500 response', async () => {
      const subscriptionStore = new InMemorySubscriptionStore();
      // Override assign to throw
      subscriptionStore.assign = async (_rt: string, _rid: string, _pid: string) => {
        throw new Error('Store error');
      };

      const config = makeConfig({ subscriptionStore });
      const handler = createWebhookHandler(config);

      const body = makeStripeEvent('customer.subscription.created', {
        id: 'sub_123',
        metadata: { tenantId: 'org-1' },
        items: { data: [{ price: { metadata: { vertzPlanId: 'pro' } } }] },
      });

      const response = await handler(await makeRequest(body));

      expect(response.status).toBe(500);
    });
  });

  describe('Given invalid JSON in request body', () => {
    it('returns 400 response', async () => {
      const config = makeConfig();
      const handler = createWebhookHandler(config);

      const response = await handler(
        new Request('http://localhost/webhooks', {
          method: 'POST',
          body: 'not json',
          headers: {
            'content-type': 'application/json',
            'stripe-signature': 'whsec_test',
          },
        }),
      );

      expect(response.status).toBe(400);
    });
  });
});
