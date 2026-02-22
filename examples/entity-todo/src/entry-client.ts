/**
 * Client-side entry point for Entity Todo.
 *
 * For SSR with hydration:
 * - If the page has data-v-id markers, hydrate() will find and hydrate them
 * - If no markers (full SSR render), the app content is already in the DOM
 * 
 * For SPA mode:
 * - mount() replaces the #app content with the rendered App
 */

import { hydrate, mount } from '@vertz/ui';
import { App } from './app';
import { todoTheme } from './styles/theme';
import { globalStyles } from './index';

// Check if we're in SSR mode by looking for hydration markers
const hasHydrationMarkers = document.querySelector('[data-v-id]') !== null;

if (hasHydrationMarkers) {
  // SSR mode: hydrate the interactive components
  // The registry would be auto-generated or provided by the build
  // For now, we provide an empty registry as the components are statically rendered
  const registry: Record<string, () => Promise<{ default: (props: Record<string, unknown>, el: Element) => void }>> = {};
  hydrate(registry);
} else {
  // SPA mode: mount the app directly to #app
  // Note: globalStyles.css is the compiled CSS string from index.ts
  // We need to import it differently since it's not exported
  mount(App, '#app', {
    theme: todoTheme,
  });
}
