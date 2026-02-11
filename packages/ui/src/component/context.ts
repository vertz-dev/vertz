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
      ctx._stack.push(value);
      try {
        fn();
      } finally {
        ctx._stack.pop();
      }
    },
    _default: defaultValue,
    _stack: [],
  };
  return ctx;
}

/**
 * Retrieve the current value from the nearest Provider.
 * Returns the default value if no Provider is active.
 */
export function useContext<T>(ctx: Context<T>): T | undefined {
  if (ctx._stack.length > 0) {
    return ctx._stack[ctx._stack.length - 1] as T;
  }
  return ctx._default;
}
