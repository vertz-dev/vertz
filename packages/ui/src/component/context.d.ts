/**
 * A snapshot of context values at a point in time.
 * Each Provider creates a new scope that inherits from the parent.
 * Effects capture this scope so that useContext works in async callbacks.
 */
export type ContextScope = Map<Context<unknown>, unknown>;
/** A context object created by `createContext`. */
export interface Context<T> {
  /** Provide a value to all `useContext` calls within the scope. */
  Provider: (value: T, fn: () => void) => void;
  /** @internal — current value stack */
  _stack: T[];
  /** @internal — default value */
  _default: T | undefined;
}
/**
 * Create a context with an optional default value.
 * Returns an object with a `Provider` function.
 */
export declare function createContext<T>(defaultValue?: T): Context<T>;
/**
 * Retrieve the current value from the nearest Provider.
 * Checks the synchronous call stack first, then falls back to
 * the captured context scope (for async callbacks like watch/effect).
 * Returns the default value if no Provider is active.
 */
export declare function useContext<T>(ctx: Context<T>): T | undefined;
/**
 * Get the current context scope for capture by effects.
 * @internal
 */
export declare function getContextScope(): ContextScope | null;
/**
 * Set the current context scope (used by effects to restore captured context).
 * Returns the previous scope for restoration.
 * @internal
 */
export declare function setContextScope(scope: ContextScope | null): ContextScope | null;
//# sourceMappingURL=context.d.ts.map
