/**
 * Hydration strategies determine WHEN a component gets hydrated.
 *
 * - eager: immediately on page load
 * - lazy (default): when element becomes visible (IntersectionObserver)
 * - interaction: on first user event (click, focus, pointerenter)
 */

/** Eager -- hydrate immediately on page load. */
export function eagerStrategy(el: Element, hydrateFn: () => void): void {
  void el;
  hydrateFn();
}

/** Lazy (default) -- hydrate when element becomes visible via IntersectionObserver. */
export function lazyStrategy(el: Element, hydrateFn: () => void): void {
  if (typeof IntersectionObserver === 'undefined') {
    // Fallback to eager when IntersectionObserver is not available
    hydrateFn();
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          observer.disconnect();
          hydrateFn();
          return;
        }
      }
    },
    { rootMargin: '200px' },
  );

  observer.observe(el);
}

/** Interaction -- hydrate on first user event (click, focus, pointerenter). */
export function interactionStrategy(el: Element, hydrateFn: () => void): void {
  const events = ['click', 'focus', 'pointerenter'] as const;

  function handler(): void {
    for (const event of events) {
      el.removeEventListener(event, handler);
    }
    hydrateFn();
  }

  for (const event of events) {
    el.addEventListener(event, handler);
  }
}
