import type { DisposeFn } from '../runtime/signal-types';
/**
 * Create a reactive attribute binding.
 * When the value returned by `fn` changes, the attribute is updated.
 * If fn returns null or undefined, the attribute is removed.
 *
 * Compiler output target for reactive attribute expressions.
 * Returns a dispose function to stop the reactive binding.
 */
export declare function __attr(
  el: HTMLElement,
  name: string,
  fn: () => string | null | undefined,
): DisposeFn;
/**
 * Reactive display toggle.
 * When fn() returns false, the element is hidden (display: none).
 * When fn() returns true, the element is shown (display restored).
 *
 * Compiler output target for v-show / conditional display directives.
 * Returns a dispose function to stop the reactive binding.
 */
export declare function __show(el: HTMLElement, fn: () => boolean): DisposeFn;
/**
 * Reactive class binding.
 * Each key in the classMap is a class name; the value function determines
 * whether that class is present.
 *
 * Compiler output target for reactive class expressions.
 * Returns a dispose function to stop all reactive bindings.
 */
export declare function __classList(
  el: HTMLElement,
  classMap: Record<string, () => boolean>,
): DisposeFn;
//# sourceMappingURL=attributes.d.ts.map
