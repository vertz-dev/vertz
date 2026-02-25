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

/** Erase a typed Context<T> to the untyped key used by ContextScope maps. */
function asKey<T>(ctx: Context<T>): Context<unknown> {
  return ctx as Context<unknown>;
}

/**
 * Global context registry keyed by stable ID.
 * Lives on globalThis so it survives bundle re-evaluation during HMR.
 * When Bun re-evaluates a bundle, createContext() with the same ID returns
 * the existing object — preserving object identity for ContextScope Map keys.
 *
 * @internal — only used by the HMR system; invisible to end users.
 */
const REGISTRY_KEY = '__VERTZ_CTX_REG__';
const contextRegistry: Map<string, Context<unknown>> =
  ((globalThis as Record<string, unknown>)[REGISTRY_KEY] as Map<string, Context<unknown>>) ??
  (() => {
    const m = new Map<string, Context<unknown>>();
    (globalThis as Record<string, unknown>)[REGISTRY_KEY] = m;
    return m;
  })();

/**
 * Create a context with an optional default value.
 * Returns an object with a `Provider` function.
 *
 * The optional `__stableId` parameter is injected by the compiler for HMR
 * support. When provided, the context object is cached in a global registry
 * so that bundle re-evaluation returns the same object — preserving identity
 * for ContextScope Map lookups. Users never pass this parameter directly.
 */
export function createContext<T>(defaultValue?: T, __stableId?: string): Context<T> {
  // HMR: return existing context if the same ID was already registered
  if (__stableId) {
    const existing = contextRegistry.get(__stableId);
    if (existing) return existing as Context<T>;
  }

  const ctx: Context<T> = {
    Provider(value: T, fn: () => void): void {
      // Build a new scope that inherits all existing context values
      const parentScope = currentScope;
      const scope: ContextScope = parentScope ? new Map(parentScope) : new Map();
      scope.set(asKey(ctx), value);

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

  // Register for HMR stability
  if (__stableId) {
    contextRegistry.set(__stableId, ctx as Context<unknown>);
  }

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
  const key = asKey(ctx);
  if (currentScope?.has(key)) {
    return currentScope.get(key) as T;
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
