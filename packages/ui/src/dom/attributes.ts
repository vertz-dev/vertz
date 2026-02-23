import { effect, isSSR } from '../runtime/signal';
import type { DisposeFn } from '../runtime/signal-types';
import { unwrapSignal } from './element';

/**
 * Create a reactive attribute binding.
 * When the value returned by `fn` changes, the attribute is updated.
 * If fn returns null or undefined, the attribute is removed.
 *
 * Compiler output target for reactive attribute expressions.
 * Returns a dispose function to stop the reactive binding.
 */
export function __attr(
  el: HTMLElement,
  name: string,
  fn: () => string | boolean | null | undefined,
): DisposeFn {
  if (isSSR()) {
    let value: unknown = fn();
    value = unwrapSignal(value);
    if (value == null || value === false) {
      el.removeAttribute(name);
    } else if (value === true) {
      el.setAttribute(name, '');
    } else {
      el.setAttribute(name, String(value));
    }
    return () => {};
  }
  return effect(() => {
    const value = fn();
    if (value == null || value === false) {
      el.removeAttribute(name);
    } else if (value === true) {
      el.setAttribute(name, '');
    } else {
      el.setAttribute(name, value);
    }
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
  return effect(() => {
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
      effect(() => {
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
