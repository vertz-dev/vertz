import type { DisposeFn } from './signal-types';
/**
 * Error thrown when `onCleanup()` is called outside a disposal scope.
 * Similar to React's invalid hook call error — fail-fast so developers
 * know their cleanup callback was not registered.
 */
export declare class DisposalScopeError extends Error {
  constructor();
}
/**
 * Register a cleanup function with the current disposal scope.
 * Throws `DisposalScopeError` if no scope is active — fail-fast
 * so developers know their cleanup callback was not registered.
 */
export declare function onCleanup(fn: DisposeFn): void;
/**
 * Try to register a cleanup function with the current disposal scope.
 * If no scope is active, the callback is silently discarded.
 *
 * @internal — Used by runtime primitives (effect, watch, __list) that
 * optionally register with a parent scope but work fine without one.
 */
export declare function _tryOnCleanup(fn: DisposeFn): void;
/**
 * Push a new cleanup scope. All onCleanup calls within this scope
 * will be collected and returned when the scope is popped.
 */
export declare function pushScope(): DisposeFn[];
/**
 * Pop the current cleanup scope.
 */
export declare function popScope(): void;
/**
 * Run all collected cleanup functions in LIFO (reverse) order and clear the list.
 * Reverse order matches try/finally semantics — last registered, first cleaned up.
 */
export declare function runCleanups(cleanups: DisposeFn[]): void;
//# sourceMappingURL=disposal.d.ts.map
