/**
 * Billing Event Emitter — typed event system for billing lifecycle events.
 *
 * Events: subscription:created, subscription:canceled, billing:payment_failed
 */

// ============================================================================
// Types
// ============================================================================

export type BillingEventType =
  | 'subscription:created'
  | 'subscription:canceled'
  | 'billing:payment_failed';

export interface BillingEvent {
  resourceType: string;
  resourceId: string;
  planId: string;
  attempt?: number;
}

export type BillingEventHandler = (event: BillingEvent) => void;

export interface BillingEventEmitter {
  on(eventType: BillingEventType, handler: BillingEventHandler): void;
  off(eventType: BillingEventType, handler: BillingEventHandler): void;
  emit(eventType: BillingEventType, event: BillingEvent): void;
}

// ============================================================================
// Implementation
// ============================================================================

export function createBillingEventEmitter(): BillingEventEmitter {
  const handlers = new Map<BillingEventType, BillingEventHandler[]>();

  return {
    on(eventType: BillingEventType, handler: BillingEventHandler): void {
      const list = handlers.get(eventType) ?? [];
      list.push(handler);
      handlers.set(eventType, list);
    },

    off(eventType: BillingEventType, handler: BillingEventHandler): void {
      const list = handlers.get(eventType);
      if (!list) return;
      const idx = list.indexOf(handler);
      if (idx >= 0) list.splice(idx, 1);
    },

    emit(eventType: BillingEventType, event: BillingEvent): void {
      const list = handlers.get(eventType);
      if (!list) return;
      for (const handler of list) {
        try {
          handler(event);
        } catch {
          // Isolate handler errors — don't let one handler break others
        }
      }
    },
  };
}
