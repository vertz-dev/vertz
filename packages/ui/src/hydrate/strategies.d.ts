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
export declare function eagerStrategy(el: Element, hydrateFn: () => void): void;
/** Lazy (default) -- hydrate when element becomes visible via IntersectionObserver with 200px rootMargin. */
export declare function lazyStrategy(el: Element, hydrateFn: () => void): void;
/** Interaction -- hydrate on first user event (click, focus, pointerenter). */
export declare function interactionStrategy(el: Element, hydrateFn: () => void): void;
/** Idle -- hydrate during browser idle time via requestIdleCallback. Falls back to setTimeout(fn, 0). */
export declare function idleStrategy(el: Element, hydrateFn: () => void): void;
/**
 * Media -- hydrate when a CSS media query matches.
 * Returns a strategy function bound to the given query string.
 */
export declare function mediaStrategy(query: string): (el: Element, hydrateFn: () => void) => void;
/** Visible -- hydrate when element enters the viewport via IntersectionObserver (no rootMargin). */
export declare function visibleStrategy(el: Element, hydrateFn: () => void): void;
//# sourceMappingURL=strategies.d.ts.map
