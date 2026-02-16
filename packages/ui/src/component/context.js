/** The currently active context scope. */
let currentScope = null;
/** Erase a typed Context<T> to the untyped key used by ContextScope maps. */
function asKey(ctx) {
  return ctx;
}
/**
 * Create a context with an optional default value.
 * Returns an object with a `Provider` function.
 */
export function createContext(defaultValue) {
  const ctx = {
    Provider(value, fn) {
      // Build a new scope that inherits all existing context values
      const parentScope = currentScope;
      const scope = parentScope ? new Map(parentScope) : new Map();
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
  return ctx;
}
/**
 * Retrieve the current value from the nearest Provider.
 * Checks the synchronous call stack first, then falls back to
 * the captured context scope (for async callbacks like watch/effect).
 * Returns the default value if no Provider is active.
 */
export function useContext(ctx) {
  // Synchronous path: Provider is currently on the call stack
  if (ctx._stack.length > 0) {
    return ctx._stack[ctx._stack.length - 1];
  }
  // Async path: check the captured context scope
  const key = asKey(ctx);
  if (currentScope?.has(key)) {
    return currentScope.get(key);
  }
  return ctx._default;
}
/**
 * Get the current context scope for capture by effects.
 * @internal
 */
export function getContextScope() {
  return currentScope;
}
/**
 * Set the current context scope (used by effects to restore captured context).
 * Returns the previous scope for restoration.
 * @internal
 */
export function setContextScope(scope) {
  const prev = currentScope;
  currentScope = scope;
  return prev;
}
//# sourceMappingURL=context.js.map
