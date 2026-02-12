import type { DisposeFn } from './signal-types';

/**
 * Error thrown when `onCleanup()` is called outside a disposal scope.
 * Similar to React's invalid hook call error — fail-fast so developers
 * know their cleanup callback was not registered.
 */
export class DisposalScopeError extends Error {
  constructor() {
    super(
      'onCleanup() must be called within a disposal scope (e.g., inside effect(), watch(), onMount(), or a pushScope()/popScope() block). ' +
        'Called outside a scope, the cleanup callback would be silently discarded.',
    );
    this.name = 'DisposalScopeError';
  }
}

/**
 * Stack of active cleanup collectors.
 * When a component or scope is being set up, cleanup functions
 * are registered to the current collector for later disposal.
 */
const cleanupStack: DisposeFn[][] = [];

/**
 * Register a cleanup function with the current disposal scope.
 * Throws `DisposalScopeError` if no scope is active — fail-fast
 * so developers know their cleanup callback was not registered.
 */
export function onCleanup(fn: DisposeFn): void {
  const current = cleanupStack[cleanupStack.length - 1];
  if (!current) {
    throw new DisposalScopeError();
  }
  current.push(fn);
}

/**
 * Try to register a cleanup function with the current disposal scope.
 * If no scope is active, the callback is silently discarded.
 *
 * @internal — Used by runtime primitives (effect, watch, __list) that
 * optionally register with a parent scope but work fine without one.
 */
export function _tryOnCleanup(fn: DisposeFn): void {
  const current = cleanupStack[cleanupStack.length - 1];
  if (current) {
    current.push(fn);
  }
}

/**
 * Push a new cleanup scope. All onCleanup calls within this scope
 * will be collected and returned when the scope is popped.
 */
export function pushScope(): DisposeFn[] {
  const scope: DisposeFn[] = [];
  cleanupStack.push(scope);
  return scope;
}

/**
 * Pop the current cleanup scope.
 */
export function popScope(): void {
  cleanupStack.pop();
}

/**
 * Run all collected cleanup functions in LIFO (reverse) order and clear the list.
 * Reverse order matches try/finally semantics — last registered, first cleaned up.
 */
export function runCleanups(cleanups: DisposeFn[]): void {
  for (let i = cleanups.length - 1; i >= 0; i--) {
    cleanups[i]?.();
  }
  cleanups.length = 0;
}
