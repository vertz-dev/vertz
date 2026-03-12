import type { ComponentLoader } from './component-registry';
import { autoStrategy } from './strategies';

/**
 * Registry mapping island IDs to lazy component loaders.
 * Each key must match the `id` prop of an `<Island>` component in the SSR output.
 */
export type IslandRegistry = Record<string, ComponentLoader>;

/**
 * Hydration queue to serialize island hydration (one at a time).
 * Prevents concurrent startHydration() calls which would throw.
 */
const hydrationQueue: Array<() => Promise<void>> = [];
let isProcessing = false;

async function processQueue(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;
  while (hydrationQueue.length > 0) {
    const task = hydrationQueue.shift()!;
    await task();
  }
  isProcessing = false;
}

/**
 * Deserialize island props from the direct child script tag.
 * Uses `data-v-island-props` attribute to avoid conflicts with
 * nested `<script type="application/json">` tags from data-v-id hydration.
 */
function deserializeIslandProps(container: Element): Record<string, unknown> {
  const script = container.querySelector(':scope > script[data-v-island-props]');
  if (!script || !script.textContent) {
    return {};
  }
  try {
    return JSON.parse(script.textContent) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Client entry point for island-mode hydration.
 *
 * Scans the DOM for elements with `data-v-island` markers placed by the
 * `<Island>` component during SSR. For each, deserializes props and hydrates
 * the component using viewport-based lazy hydration (IntersectionObserver).
 *
 * This is an alternative to `mount()` for pages that are mostly static
 * with a few interactive islands. Never call both `mount()` and
 * `hydrateIslands()` on the same page.
 */
export function hydrateIslands(registry: IslandRegistry): void {
  const elements = document.querySelectorAll('[data-v-island]');
  const registryKeys = Object.keys(registry);

  for (const el of elements) {
    if (el.hasAttribute('data-v-hydrated')) continue;

    const islandId = el.getAttribute('data-v-island');
    if (!islandId) continue;

    const loader = registry[islandId];
    if (!loader) {
      console.error(
        `[vertz] Island "${islandId}" not found in registry. Available: [${registryKeys.join(', ')}]`,
      );
      continue;
    }

    const props = deserializeIslandProps(el);

    const doHydrate = (): void => {
      hydrationQueue.push(async () => {
        try {
          const mod = await loader();
          mod.default(props, el as HTMLElement);
          el.setAttribute('data-v-hydrated', '');
        } catch (error: unknown) {
          console.error(`[vertz] Failed to hydrate island "${islandId}":`, error);
        }
      });
      void processQueue();
    };

    autoStrategy(el, doHydrate);
  }
}
