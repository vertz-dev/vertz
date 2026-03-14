import type { Entitlement, RawAccessCheck } from '@vertz/ui/auth';
import { canSignals } from '@vertz/ui/auth';

/**
 * Create entitlement checks for the given entitlements and return a function
 * that evaluates whether all are allowed. The returned function reads signal
 * `.value` properties, so it must be called inside a reactive scope (computed,
 * domEffect, __child, __conditional) to establish tracking.
 *
 * `canSignals()` is called eagerly (must happen while context scope is active),
 * and the returned function reads `.allowed.value` lazily.
 */
export function createEntitlementGuard(requires: Entitlement[] | undefined): () => boolean {
  if (!requires || requires.length === 0) {
    return () => true;
  }
  // Call canSignals() eagerly while context scope is available
  const checks: RawAccessCheck[] = requires.map((e) => canSignals(e));
  // Return a function that reads .allowed.value reactively — no double-cast needed
  return () => checks.every((c) => c.allowed.value);
}
