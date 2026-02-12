import type { ComponentRegistry } from './component-registry';
import { resolveComponent } from './component-registry';
import { deserializeProps } from './props-deserializer';
import { eagerStrategy, interactionStrategy, lazyStrategy } from './strategies';

type HydrationStrategy = 'eager' | 'interaction' | 'lazy';

/**
 * Client entry point for atomic per-component hydration.
 *
 * Scans the DOM for elements with `data-v-id` markers placed by the SSR pass,
 * deserializes their props, and applies the appropriate hydration strategy.
 *
 * Components without `data-v-id` markers are static and ship zero JS.
 */
export function hydrate(registry: ComponentRegistry): void {
  const elements = document.querySelectorAll('[data-v-id]');

  for (const el of elements) {
    const componentId = el.getAttribute('data-v-id');
    if (!componentId) continue;

    const strategy = (el.getAttribute('hydrate') as HydrationStrategy | null) ?? 'lazy';
    const props = deserializeProps(el);

    const doHydrate = (): void => {
      void resolveComponent(registry, componentId)
        .then((component) => {
          component(props, el);
        })
        .catch((error: unknown) => {
          console.error(`[hydrate] Failed to hydrate component "${componentId}":`, error);
        });
    };

    switch (strategy) {
      case 'eager':
        eagerStrategy(el, doHydrate);
        break;
      case 'lazy':
        lazyStrategy(el, doHydrate);
        break;
      case 'interaction':
        interactionStrategy(el, doHydrate);
        break;
      default:
        lazyStrategy(el, doHydrate);
    }
  }
}
