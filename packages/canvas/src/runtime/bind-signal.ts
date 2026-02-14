import { effect } from '@vertz/ui';
import type { DisposeFn } from '@vertz/ui';

/** A value that may be static or a signal getter. */
export type MaybeReactive<T> = T | (() => T);

/**
 * Bind a potentially-reactive value to a target property.
 *
 * - function (signal getter) → creates an effect
 * - static value → sets once
 * - undefined → no-op
 *
 * This is the core primitive bridging vertz signals → PixiJS properties.
 */
export function bindProp<T extends Record<string, any>>(
  target: T,
  key: keyof T & string,
  value: MaybeReactive<T[typeof key]> | undefined,
): DisposeFn | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'function') {
    return effect(() => { (target as any)[key] = (value as () => any)(); });
  }
  (target as any)[key] = value;
  return undefined;
}

/**
 * Like bindProp but with a custom setter (e.g. for `.set(v, v)` APIs).
 */
export function bindPropCustom<V>(
  value: MaybeReactive<V> | undefined,
  apply: (v: V) => void,
): DisposeFn | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'function') {
    return effect(() => { apply((value as () => V)()); });
  }
  apply(value);
  return undefined;
}
