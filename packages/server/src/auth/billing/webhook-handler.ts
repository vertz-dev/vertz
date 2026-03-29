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

function extractResource(obj: Record<string, unknown>): { type: string; id: string } | null {
  // Try direct metadata first
  const meta = obj.metadata as Record<string, string> | undefined;
  let resourceId = meta?.resourceId ?? meta?.tenantId;
  let resourceType = meta?.resourceType ?? 'tenant';

  // Fallback: try subscription_details.metadata (for invoice events)
  if (!resourceId) {
    const subDetails = obj.subscription_details as Record<string, unknown> | undefined;
    if (subDetails?.metadata) {
      const subMeta = subDetails.metadata as Record<string, string>;
      resourceId = subMeta.resourceId ?? subMeta.tenantId;
      resourceType = subMeta.resourceType ?? 'tenant';
    }
  }

  return resourceId ? { type: resourceType, id: resourceId } : null;
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
          const resource = extractResource(obj);
          const planId = extractPlanId(obj);
          if (resource && planId) {
            await subscriptionStore.assign(resource.type, resource.id, planId);
            emitter.emit('subscription:created', {
              resourceType: resource.type,
              resourceId: resource.id,
              planId,
            });
          }
          break;
        }

        case 'customer.subscription.updated': {
          const resource = extractResource(obj);
          const planId = extractPlanId(obj);
          if (resource && planId) {
            await subscriptionStore.assign(resource.type, resource.id, planId);
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const resource = extractResource(obj);
          const planId = extractPlanId(obj);
          if (resource) {
            await subscriptionStore.assign(resource.type, resource.id, defaultPlan);
            emitter.emit('subscription:canceled', {
              resourceType: resource.type,
              resourceId: resource.id,
              planId: planId ?? defaultPlan,
            });
          }
          break;
        }

        case 'invoice.payment_failed': {
          const resource = extractResource(obj);
          const planId = extractPlanId(obj);
          const attemptCount = (obj.attempt_count as number) ?? 1;
          if (resource) {
            emitter.emit('billing:payment_failed', {
              resourceType: resource.type,
              resourceId: resource.id,
              planId: planId ?? '',
              attempt: attemptCount,
            });
          }
          break;
        }

        case 'checkout.session.completed': {
          const resource = extractResource(obj);
          const planId = extractPlanId(obj);
          const meta = obj.metadata as Record<string, string> | undefined;
          const isAddOn = meta?.isAddOn === 'true';

          if (resource && planId) {
            if (isAddOn && subscriptionStore.attachAddOn) {
              await subscriptionStore.attachAddOn(resource.type, resource.id, planId);
            } else {
              await subscriptionStore.assign(resource.type, resource.id, planId);
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
