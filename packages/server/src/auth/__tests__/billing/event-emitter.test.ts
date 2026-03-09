import { describe, expect, it } from 'bun:test';
import { type BillingEvent, createBillingEventEmitter } from '../../billing/event-emitter';

describe('Feature: Billing event emitter', () => {
  describe('Given a handler registered for subscription:created', () => {
    it('calls the handler with the correct payload', () => {
      const emitter = createBillingEventEmitter();
      const received: BillingEvent[] = [];

      emitter.on('subscription:created', (event) => {
        received.push(event);
      });

      emitter.emit('subscription:created', { tenantId: 'org-1', planId: 'pro' });

      expect(received).toHaveLength(1);
      expect(received[0].tenantId).toBe('org-1');
      expect(received[0].planId).toBe('pro');
    });
  });

  describe('Given multiple handlers for the same event', () => {
    it('fires all handlers', () => {
      const emitter = createBillingEventEmitter();
      let count = 0;

      emitter.on('subscription:created', () => {
        count++;
      });
      emitter.on('subscription:created', () => {
        count++;
      });

      emitter.emit('subscription:created', { tenantId: 'org-1', planId: 'pro' });

      expect(count).toBe(2);
    });
  });

  describe('Given no handlers registered for an event', () => {
    it('does not throw when emitting', () => {
      const emitter = createBillingEventEmitter();
      expect(() => {
        emitter.emit('subscription:canceled', { tenantId: 'org-1', planId: 'pro' });
      }).not.toThrow();
    });
  });

  describe('Given a handler for billing:payment_failed', () => {
    it('receives the attempt number in payload', () => {
      const emitter = createBillingEventEmitter();
      const received: BillingEvent[] = [];

      emitter.on('billing:payment_failed', (event) => {
        received.push(event);
      });

      emitter.emit('billing:payment_failed', { tenantId: 'org-1', planId: 'pro', attempt: 3 });

      expect(received).toHaveLength(1);
      expect(received[0].attempt).toBe(3);
    });
  });

  describe('Given a handler is removed via off()', () => {
    it('no longer fires for subsequent events', () => {
      const emitter = createBillingEventEmitter();
      let count = 0;
      const handler = () => {
        count++;
      };

      emitter.on('subscription:created', handler);
      emitter.emit('subscription:created', { tenantId: 'org-1', planId: 'pro' });
      expect(count).toBe(1);

      emitter.off('subscription:created', handler);
      emitter.emit('subscription:created', { tenantId: 'org-1', planId: 'pro' });
      expect(count).toBe(1); // Still 1, handler not called again
    });
  });

  describe('Given a handler that throws', () => {
    it('still fires subsequent handlers', () => {
      const emitter = createBillingEventEmitter();
      let secondFired = false;

      emitter.on('subscription:created', () => {
        throw new Error('handler error');
      });
      emitter.on('subscription:created', () => {
        secondFired = true;
      });

      // Should not throw and second handler should still fire
      emitter.emit('subscription:created', { tenantId: 'org-1', planId: 'pro' });
      expect(secondFired).toBe(true);
    });
  });
});
