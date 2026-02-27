/**
 * Wait for all CSS animations on an element to complete, then call back.
 * If no animations are running, calls back immediately.
 * Respects prefers-reduced-motion by skipping the wait.
 */
export function onAnimationsComplete(el: HTMLElement, callback: () => void): void {
  // Skip animation wait if user prefers reduced motion
  if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
    callback();
    return;
  }

  // Force style recalculation so animations triggered by recent
  // attribute/class changes are registered before we snapshot.
  // Without this, getAnimations() returns [] if called in the same
  // microtask as the attribute change that triggers the CSS animation.
  void el.offsetHeight;

  if (typeof el.getAnimations === 'function') {
    const animations = el.getAnimations();
    if (animations.length > 0) {
      Promise.all(animations.map((a) => a.finished.catch(() => {}))).then(() => callback());
      return;
    }
  }

  callback();
}
