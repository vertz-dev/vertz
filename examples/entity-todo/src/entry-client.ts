/**
 * Client-side entry point for Entity Todo.
 *
 * For SSR mode:
 * - The server renders the full HTML page
 * - On client load, we mount() the app which replaces the SSR content
 * - This is the simplest approach that works for any SSR content
 *
 * For per-component hydration (advanced):
 * - Would need to register components in a registry
 * - Use hydrate(registry) to hydrate interactive components
 * - This requires build-time code generation to populate the registry
 */

import { mount } from '@vertz/ui';
import { App } from './app';
import { todoTheme } from './styles/theme';
import { globalStyles } from './index';

// Mount the app to #app
// This replaces any SSR content with the client-rendered app
// The globalStyles is imported from index.ts where it's defined via globalCss()
mount(App, '#app', {
  theme: todoTheme,
  styles: [globalStyles.css],
});
