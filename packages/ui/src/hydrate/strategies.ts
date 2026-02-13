/**
 * Hydration strategies determine WHEN a component gets hydrated.
 *
 * - eager: immediately on page load
 * - lazy (default): when element becomes visible (IntersectionObserver, 200px rootMargin)
 * - interaction: on first user event (click, focus, pointerenter)
 * - idle: during browser idle time (requestIdleCallback, falls back to setTimeout)
 * - media(query): when a CSS media query matches
 * - visible: when element enters the viewport (IntersectionObserver, no rootMargin)
 */

/** Eager -- hydrate immediately on page load. */
export function eagerStrategy(el: Element, hydrateFn: () => void): void {
  void el;
  hydrateFn();
}

/** Lazy (default) -- hydrate when element becomes visible via IntersectionObserver with 200px rootMargin. */
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

/** Idle -- hydrate during browser idle time via requestIdleCallback. Falls back to setTimeout(fn, 0). */
export function idleStrategy(el: Element, hydrateFn: () => void): void {
  void el;
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => hydrateFn());
  } else {
    setTimeout(hydrateFn, 0);
  }
}

/**
 * Media -- hydrate when a CSS media query matches.
 * Returns a strategy function bound to the given query string.
 */
export function mediaStrategy(query: string): (el: Element, hydrateFn: () => void) => void {
  return (el: Element, hydrateFn: () => void): void => {
    void el;
    const mql = window.matchMedia(query);

    if (mql.matches) {
      hydrateFn();
      return;
    }

    function onChange(event: MediaQueryListEvent | { matches: boolean }): void {
      if (event.matches) {
        mql.removeEventListener('change', onChange);
        hydrateFn();
      }
    }

    mql.addEventListener('change', onChange);
  };
}

/** Visible -- hydrate when element enters the viewport via IntersectionObserver (no rootMargin). */
export function visibleStrategy(el: Element, hydrateFn: () => void): void {
  if (typeof IntersectionObserver === 'undefined') {
    // Fallback to eager when IntersectionObserver is not available
    hydrateFn();
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        observer.disconnect();
        hydrateFn();
        return;
      }
    }
  });

  observer.observe(el);
}
