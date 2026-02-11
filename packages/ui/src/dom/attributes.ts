import { effect } from '../runtime/signal';

/**
 * Create a reactive attribute binding.
 * When the value returned by `fn` changes, the attribute is updated.
 * If fn returns null or undefined, the attribute is removed.
 *
 * Compiler output target for reactive attribute expressions.
 */
export function __attr(el: HTMLElement, name: string, fn: () => string | null | undefined): void {
  effect(() => {
    const value = fn();
    if (value == null) {
      el.removeAttribute(name);
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
 */
export function __show(el: HTMLElement, fn: () => boolean): void {
  // Capture the original display value so we can restore it
  const originalDisplay = el.style.display;
  effect(() => {
    el.style.display = fn() ? originalDisplay : 'none';
  });
}

/**
 * Reactive class binding.
 * Each key in the classMap is a class name; the value function determines
 * whether that class is present.
 *
 * Compiler output target for reactive class expressions.
 */
export function __classList(el: HTMLElement, classMap: Record<string, () => boolean>): void {
  for (const [className, fn] of Object.entries(classMap)) {
    effect(() => {
      if (fn()) {
        el.classList.add(className);
      } else {
        el.classList.remove(className);
      }
    });
  }
}
