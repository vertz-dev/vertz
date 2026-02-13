import type { ComponentRegistry } from './component-registry';
import { resolveComponent } from './component-registry';
import { deserializeProps } from './props-deserializer';
import {
  eagerStrategy,
  idleStrategy,
  interactionStrategy,
  lazyStrategy,
  mediaStrategy,
  visibleStrategy,
} from './strategies';

type HydrationStrategy = 'eager' | 'interaction' | 'lazy' | 'idle' | 'media' | 'visible';

/**
 * Client entry point for atomic per-component hydration.
 *
 * Scans the DOM for elements with `data-v-id` markers placed by the SSR pass,
 * deserializes their props, and applies the appropriate hydration strategy.
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

    const strategy = (el.getAttribute('hydrate') as HydrationStrategy | null) ?? 'lazy';
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
      case 'idle':
        idleStrategy(el, doHydrate);
        break;
      case 'media': {
        const query = el.getAttribute('hydrate-media') ?? '';
        mediaStrategy(query)(el, doHydrate);
        break;
      }
      case 'visible':
        visibleStrategy(el, doHydrate);
        break;
      default:
        lazyStrategy(el, doHydrate);
    }
  }
}
