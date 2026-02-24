/**
 * Automatic hydration strategy.
 *
 * Uses IntersectionObserver with 200px rootMargin to detect viewport proximity.
 * Above-fold elements hydrate in the first IO callback (effectively eager).
 * Below-fold elements wait until scrolled into view.
 *
 * Falls back to eager hydration when IntersectionObserver is unavailable.
 */
export function autoStrategy(el: Element, hydrateFn: () => void): void {
  if (typeof IntersectionObserver === 'undefined') {
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
