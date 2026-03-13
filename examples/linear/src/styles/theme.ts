/**
 * Theme configuration for the Linear clone.
 *
 * Uses slate palette — closest to Linear's cool gray tones.
 * Full Linear-inspired palette deferred to Phase 2.
 */

import { configureTheme } from '@vertz/theme-shadcn';

const { theme, globals } = configureTheme({
  palette: 'slate',
  radius: 'md',
});

export const linearTheme = theme;
export const themeGlobals = globals;
