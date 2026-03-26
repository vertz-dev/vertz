/**
 * Webhook Metadata Edge Cases — Coverage hardening for auth/billing/webhook-handler.ts
 * Tests: invoice tenant extraction, price metadata planId, checkout add-on fallback
 */

import { describe, expect, it } from 'bun:test';
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
  return new Request('http://localhost/webhooks', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'stripe-signature': secret,
    },
  });
}

describe('Webhook Metadata Edge Cases', () => {
  describe('Given an invoice event with nested subscription_details.metadata', () => {
    describe('When the webhook handler processes the event', () => {
      it('Then extracts tenantId from subscription_details.metadata (lines 42-44)', async () => {
        const subscriptionStore = new InMemorySubscriptionStore();
        const emitter = createBillingEventEmitter();
        const events: unknown[] = [];
        emitter.on('billing:payment_failed', (data) => events.push(data));

        const config = makeConfig({ subscriptionStore, emitter });
        const handler = createWebhookHandler(config);

        // Invoice event — tenantId is in subscription_details.metadata, not direct metadata
        const body = makeStripeEvent('invoice.payment_failed', {
          id: 'inv_123',
          attempt_count: 2,
          subscription_details: {
            metadata: { tenantId: 'org-nested' },
          },
        });

        const response = await handler(await makeRequest(body));

        expect(response.status).toBe(200);
        expect(events).toHaveLength(1);
        expect(events[0]).toEqual({
          tenantId: 'org-nested',
          planId: '',
          attempt: 2,
        });
      });
    });
  });

  describe('Given a subscription event with planId in items.data[0].price.metadata', () => {
    describe('When the webhook handler processes the event', () => {
      it('Then extracts planId from price metadata (line 58-60)', async () => {
        const subscriptionStore = new InMemorySubscriptionStore();
        const config = makeConfig({ subscriptionStore });
        const handler = createWebhookHandler(config);

        // No direct metadata.vertzPlanId — only in items.data[0].price.metadata
        const body = makeStripeEvent('customer.subscription.created', {
          id: 'sub_123',
          metadata: { tenantId: 'org-1' },
          items: {
            data: [{ price: { metadata: { vertzPlanId: 'enterprise' } } }],
          },
        });

        const response = await handler(await makeRequest(body));

        expect(response.status).toBe(200);
        const plan = await subscriptionStore.get('tenant', 'org-1');
        expect(plan).not.toBeNull();
        expect(plan?.planId).toBe('enterprise');
      });
    });
  });

  describe('Given a checkout.session.completed with isAddOn but no attachAddOn method', () => {
    describe('When the webhook handler processes the event', () => {
      it('Then falls back to assign (line 154)', async () => {
        // Create a store WITHOUT attachAddOn method
        const backing = new InMemorySubscriptionStore();
        const subscriptionStore: WebhookHandlerConfig['subscriptionStore'] = {
          assign: backing.assign.bind(backing),
          get: backing.get.bind(backing),
          updateOverrides: backing.updateOverrides.bind(backing),
          remove: backing.remove.bind(backing),
          dispose: backing.dispose.bind(backing),
        };

        const config = makeConfig({ subscriptionStore });
        const handler = createWebhookHandler(config);

        const body = makeStripeEvent('checkout.session.completed', {
          id: 'cs_123',
          metadata: { tenantId: 'org-1', vertzPlanId: 'extra_seats', isAddOn: 'true' },
        });

        const response = await handler(await makeRequest(body));

        expect(response.status).toBe(200);
        // Should fall back to assign() since attachAddOn is undefined
        const plan = await subscriptionStore.get('tenant', 'org-1');
        expect(plan).not.toBeNull();
        expect(plan?.planId).toBe('extra_seats');
      });
    });
  });

  describe('Given an invoice event where tenantId is only on direct metadata (null fallthrough)', () => {
    describe('When subscription_details has no metadata', () => {
      it('Then extractTenantId returns null and event is skipped (line 46)', async () => {
        const emitter = createBillingEventEmitter();
        const events: unknown[] = [];
        emitter.on('billing:payment_failed', (data) => events.push(data));

        const config = makeConfig({ emitter });
        const handler = createWebhookHandler(config);

        // No tenantId in direct metadata or subscription_details
        const body = makeStripeEvent('invoice.payment_failed', {
          id: 'inv_123',
          attempt_count: 1,
        });

        const response = await handler(await makeRequest(body));

        expect(response.status).toBe(200);
        // No event emitted because tenantId is null
        expect(events).toHaveLength(0);
      });
    });
  });
});
