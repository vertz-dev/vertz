/** Reactive prop: can be a static value or accessor function. */
export type MaybeAccessor<T> = T | (() => T);

/**
 * Unwrap a MaybeAccessor to its underlying value.
 * If the value is a function, call it to get the result.
 * If it's a static value, return it directly.
 */
export function unwrap<T>(value: MaybeAccessor<T>): T {
  return typeof value === 'function' ? (value as () => T)() : value;
}
