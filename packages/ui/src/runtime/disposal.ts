import type { DisposeFn } from './signal-types';

/**
 * Stack of active cleanup collectors.
 * When a component or scope is being set up, cleanup functions
 * are registered to the current collector for later disposal.
 */
const cleanupStack: DisposeFn[][] = [];

/**
 * Register a cleanup function with the current disposal scope.
 * If no scope is active, the cleanup is a no-op (caller manages it manually).
 */
export function onCleanup(fn: DisposeFn): void {
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
