import type { Ref } from '../component/refs';

/**
 * Apply a ref to an element. Compiler output target for the JSX `ref` prop.
 *
 * Accepts either a callback ref (`(el) => void`) or an object ref
 * (`{ current: T }`). Mirrors the inline logic in `jsx-runtime/index.ts`
 * so compiled output matches runtime behavior.
 */
export function __ref<T>(el: T, ref: Ref<T> | ((el: T) => void) | null | undefined): void {
  if (ref == null) return;
  if (typeof ref === 'function') {
    ref(el);
    return;
  }
  if (typeof ref === 'object' && 'current' in ref) {
    ref.current = el;
  }
}
