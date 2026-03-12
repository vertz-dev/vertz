/**
 * Webhook Handler — maps Stripe webhook events to framework actions.
 *
 * Returns a `(Request) => Promise<Response>` handler that can be mounted
 * on any HTTP framework route.
 */

import type { SubscriptionStore } from '../subscription-store';
import type { BillingEventEmitter } from './event-emitter';

// ============================================================================
// Types
// ============================================================================

export interface WebhookHandlerConfig {
  subscriptionStore: SubscriptionStore;
  emitter: BillingEventEmitter;
  defaultPlan: string;
  webhookSecret: string;
}

interface StripeEventPayload {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

// ============================================================================
// Helpers
// ============================================================================

function extractTenantId(obj: Record<string, unknown>): string | null {
  // Try direct metadata.tenantId
  const meta = obj.metadata as Record<string, string> | undefined;
  if (meta?.tenantId) return meta.tenantId;

  // Try subscription_details.metadata.tenantId (for invoice events)
  const subDetails = obj.subscription_details as Record<string, unknown> | undefined;
  if (subDetails?.metadata) {
    const subMeta = subDetails.metadata as Record<string, string>;
    if (subMeta.tenantId) return subMeta.tenantId;
  }

  return null;
}

function extractPlanId(obj: Record<string, unknown>): string | null {
  // Try metadata.vertzPlanId directly
  const meta = obj.metadata as Record<string, string> | undefined;
  if (meta?.vertzPlanId) return meta.vertzPlanId;

  // Try items.data[0].price.metadata.vertzPlanId (for subscription events)
  const items = obj.items as
    | { data: Array<{ price: { metadata: Record<string, string> } }> }
    | undefined;
  if (items?.data?.[0]?.price?.metadata?.vertzPlanId) {
    return items.data[0].price.metadata.vertzPlanId;
  }

  return null;
}

// ============================================================================
// Implementation
// ============================================================================

export function createWebhookHandler(
  config: WebhookHandlerConfig,
): (request: Request) => Promise<Response> {
  const { subscriptionStore, emitter, defaultPlan, webhookSecret } = config;

  return async (request: Request): Promise<Response> => {
    // Validate signature (simplified — in production, use stripe.webhooks.constructEvent)
    const signature = request.headers.get('stripe-signature');
    if (signature !== webhookSecret) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    let event: StripeEventPayload;
    try {
      const body = await request.text();
      event = JSON.parse(body) as StripeEventPayload;
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const obj = event.data.object;

    try {
      switch (event.type) {
        case 'customer.subscription.created': {
          const tenantId = extractTenantId(obj);
          const planId = extractPlanId(obj);
          if (tenantId && planId) {
            await subscriptionStore.assign(tenantId, planId);
            emitter.emit('subscription:created', { tenantId, planId });
          }
          break;
        }

        case 'customer.subscription.updated': {
          const tenantId = extractTenantId(obj);
          const planId = extractPlanId(obj);
          if (tenantId && planId) {
            await subscriptionStore.assign(tenantId, planId);
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const tenantId = extractTenantId(obj);
          const planId = extractPlanId(obj);
          if (tenantId) {
            await subscriptionStore.assign(tenantId, defaultPlan);
            emitter.emit('subscription:canceled', {
              tenantId,
              planId: planId ?? defaultPlan,
            });
          }
          break;
        }

        case 'invoice.payment_failed': {
          const tenantId = extractTenantId(obj);
          const planId = extractPlanId(obj);
          const attemptCount = (obj.attempt_count as number) ?? 1;
          if (tenantId) {
            emitter.emit('billing:payment_failed', {
              tenantId,
              planId: planId ?? '',
              attempt: attemptCount,
            });
          }
          break;
        }

        case 'checkout.session.completed': {
          const tenantId = extractTenantId(obj);
          const planId = extractPlanId(obj);
          const meta = obj.metadata as Record<string, string> | undefined;
          const isAddOn = meta?.isAddOn === 'true';

          if (tenantId && planId) {
            if (isAddOn && subscriptionStore.attachAddOn) {
              await subscriptionStore.attachAddOn(tenantId, planId);
            } else {
              await subscriptionStore.assign(tenantId, planId);
            }
          }
          break;
        }

        default:
          // Unrecognized event — acknowledge but don't process
          break;
      }
    } catch {
      return new Response(JSON.stringify({ error: 'Processing failed' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}
