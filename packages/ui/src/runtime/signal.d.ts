import type { Computed, DisposeFn, Signal } from './signal-types';
/**
 * Create a reactive signal with an initial value.
 */
export declare function signal<T>(initial: T): Signal<T>;
/**
 * Create a computed (derived) reactive value.
 * The function is lazily evaluated and cached.
 */
export declare function computed<T>(fn: () => T): Computed<T>;
/**
 * Create a reactive effect that re-runs whenever its dependencies change.
 * Returns a dispose function to stop the effect.
 */
export declare function effect(fn: () => void): DisposeFn;
//# sourceMappingURL=signal.d.ts.map
