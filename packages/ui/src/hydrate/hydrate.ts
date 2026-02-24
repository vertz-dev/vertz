import type { ComponentRegistry } from './component-registry';
import { resolveComponent } from './component-registry';
import { deserializeProps } from './props-deserializer';
import { autoStrategy } from './strategies';

/**
 * Client entry point for atomic per-component hydration.
 *
 * Scans the DOM for elements with `data-v-id` markers placed by the SSR pass,
 * deserializes their props, and applies automatic hydration based on viewport
 * proximity (IntersectionObserver with 200px rootMargin).
 *
 * Components without `data-v-id` markers are static and ship zero JS.
 *
 * Elements that have already been hydrated (marked with `data-v-hydrated`)
 * are skipped to prevent double hydration when `hydrate()` is called
 * multiple times on the same page.
 */
export function hydrate(registry: ComponentRegistry): void {
  const elements = document.querySelectorAll('[data-v-id]');

  for (const el of elements) {
    // Guard against double hydration
    if (el.hasAttribute('data-v-hydrated')) continue;

    const componentId = el.getAttribute('data-v-id');
    if (!componentId) continue;

    const props = deserializeProps(el);

    const doHydrate = (): void => {
      void resolveComponent(registry, componentId)
        .then((component) => {
          component(props, el);
          el.setAttribute('data-v-hydrated', '');
        })
        .catch((error: unknown) => {
          console.error(`[hydrate] Failed to hydrate component "${componentId}":`, error);
        });
    };

    autoStrategy(el, doHydrate);
  }
}
