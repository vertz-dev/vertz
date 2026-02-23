/**
 * Entry point for the Entity Todo demo app.
 *
 * Exports App for SSR and mounts it on the client.
 */

import { mount, globalCss } from '@vertz/ui';
import { App } from './app';
import { todoTheme } from './styles/theme';
import { globalStyles } from './styles/global';

// Re-export App as default for SSR entry auto-detection
export { App };
export { globalStyles } from './styles/global';
export default App;

// ── Mount ──────────────────────────────────────────────────────

// Only mount on the client (not in SSR)
if (typeof window !== 'undefined') {
  mount(App, '#app', {
    theme: todoTheme,
    styles: [globalStyles.css],
  });
  
  console.log('Entity Todo app mounted');
}
