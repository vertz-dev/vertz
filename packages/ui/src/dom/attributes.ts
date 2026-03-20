import { deferredDomEffect } from '../runtime/signal';
import type { DisposeFn } from '../runtime/signal-types';
import { styleObjectToString } from './style';

/**
 * Create a reactive attribute binding.
 * When the value returned by `fn` changes, the attribute is updated.
 * If fn returns null or undefined, the attribute is removed.
 *
 * Compiler output target for reactive attribute expressions.
 * Returns a dispose function to stop the reactive binding.
 *
 * Uses deferredDomEffect so the first run is skipped during hydration
 * (SSR attributes are already correct). Dependency tracking is
 * established when endHydration() flushes the deferred queue.
 */
export function __attr(
  el: HTMLElement,
  name: string,
  fn: () => string | boolean | Record<string, string | number> | null | undefined,
): DisposeFn {
  return deferredDomEffect(() => {
    const value = fn();
    if (value == null || value === false) {
      el.removeAttribute(name);
    } else if (value === true) {
      el.setAttribute(name, '');
    } else if (name === 'style' && typeof value === 'object') {
      el.setAttribute(name, styleObjectToString(value as Record<string, string | number>));
    } else {
      el.setAttribute(name, value as string);
    }
  });
}

/**
 * Create a reactive DOM property binding.
 * Unlike __attr (which uses setAttribute), this directly assigns to the
 * element's IDL property (e.g., el.value, el.checked). This is required
 * for form-related properties where setAttribute doesn't control the
 * displayed state (e.g., <select>.value, <input>.checked).
 *
 * Uses deferredDomEffect so the first run is skipped during hydration.
 */
export function __prop(el: HTMLElement, name: string, fn: () => unknown): DisposeFn {
  return deferredDomEffect(() => {
    Reflect.set(el, name, fn());
  });
}

/**
 * Reactive display toggle.
 * When fn() returns false, the element is hidden (display: none).
 * When fn() returns true, the element is shown (display restored).
 *
 * Compiler output target for v-show / conditional display directives.
 * Returns a dispose function to stop the reactive binding.
 */
export function __show(el: HTMLElement, fn: () => boolean): DisposeFn {
  // Capture the original display value so we can restore it
  const originalDisplay = el.style.display;
  return deferredDomEffect(() => {
    el.style.display = fn() ? originalDisplay : 'none';
  });
}

/**
 * Reactive class binding.
 * Each key in the classMap is a class name; the value function determines
 * whether that class is present.
 *
 * Compiler output target for reactive class expressions.
 * Returns a dispose function to stop all reactive bindings.
 */
export function __classList(el: HTMLElement, classMap: Record<string, () => boolean>): DisposeFn {
  const disposers: DisposeFn[] = [];
  for (const [className, fn] of Object.entries(classMap)) {
    disposers.push(
      deferredDomEffect(() => {
        if (fn()) {
          el.classList.add(className);
        } else {
          el.classList.remove(className);
        }
      }),
    );
  }
  return () => {
    for (const dispose of disposers) {
      dispose();
    }
  };
}
