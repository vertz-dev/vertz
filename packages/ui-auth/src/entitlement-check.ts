import type { ReadonlySignal } from '@vertz/ui';
import type { AccessCheck, Entitlement } from '@vertz/ui/auth';
import { can } from '@vertz/ui/auth';

/**
 * Create entitlement checks for the given entitlements and return a function
 * that evaluates whether all are allowed. The returned function reads signal
 * `.value` properties, so it must be called inside a reactive scope (computed,
 * domEffect, __child, __conditional) to establish tracking.
 *
 * `can()` is called eagerly (must happen while context scope is active),
 * and the returned function reads `.allowed.value` lazily.
 */
export function createEntitlementGuard(requires: Entitlement[] | undefined): () => boolean {
  if (!requires || requires.length === 0) {
    return () => true;
  }
  // Call can() eagerly while context scope is available
  const checks: AccessCheck[] = requires.map((e) => can(e));
  // Return a function that reads .allowed.value reactively
  return () => checks.every((c) => (c.allowed as unknown as ReadonlySignal<boolean>).value);
}
