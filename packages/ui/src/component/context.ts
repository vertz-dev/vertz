/**
 * A snapshot of context values at a point in time.
 * Each Provider creates a new scope that inherits from the parent.
 * Effects capture this scope so that useContext works in async callbacks.
 */
export type ContextScope = Map<Context<unknown>, unknown>;

/** The currently active context scope. */
let currentScope: ContextScope | null = null;

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
export function createContext<T>(defaultValue?: T): Context<T> {
  const ctx: Context<T> = {
    Provider(value: T, fn: () => void): void {
      // Build a new scope that inherits all existing context values
      const parentScope = currentScope;
      const scope: ContextScope = parentScope ? new Map(parentScope) : new Map();
      scope.set(ctx as Context<unknown>, value);

      ctx._stack.push(value);
      const prevScope = currentScope;
      currentScope = scope;
      try {
        fn();
      } finally {
        ctx._stack.pop();
        currentScope = prevScope;
      }
    },
    _default: defaultValue,
    _stack: [],
  };
  return ctx;
}

/**
 * Retrieve the current value from the nearest Provider.
 * Checks the synchronous call stack first, then falls back to
 * the captured context scope (for async callbacks like watch/effect).
 * Returns the default value if no Provider is active.
 */
export function useContext<T>(ctx: Context<T>): T | undefined {
  // Synchronous path: Provider is currently on the call stack
  if (ctx._stack.length > 0) {
    return ctx._stack[ctx._stack.length - 1] as T;
  }
  // Async path: check the captured context scope
  if (currentScope?.has(ctx as Context<unknown>)) {
    return currentScope.get(ctx as Context<unknown>) as T;
  }
  return ctx._default;
}

/**
 * Get the current context scope for capture by effects.
 * @internal
 */
export function getContextScope(): ContextScope | null {
  return currentScope;
}

/**
 * Set the current context scope (used by effects to restore captured context).
 * Returns the previous scope for restoration.
 * @internal
 */
export function setContextScope(scope: ContextScope | null): ContextScope | null {
  const prev = currentScope;
  currentScope = scope;
  return prev;
}
